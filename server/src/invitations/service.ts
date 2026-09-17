import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../db/client.js";
import {
  domainEvents,
  invitations,
  matchCandidates,
  notificationOutbox,
  requestRoleSlots,
  requests,
  sessionMembers,
  sessions,
  statusEvents,
  userProfiles,
} from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";
import type { AuthUser } from "../http/types.js";
import { assertNotificationPayloadSafe } from "../notifications/service.js";
import {
  decideInvitationTransition,
  isSessionFulfilled,
  type InvitationAction,
} from "./state-machine.js";

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
type Transaction = DatabaseTransaction;

export type DispatchCandidate = {
  id: string;
  userId: string;
  roleSlotId: string;
  rank: number;
  candidateType: "PRIMARY" | "BACKUP";
};

export type DispatchRequest = {
  id: string;
  creatorUserId: string;
  schoolId: string;
  startsAt: Date;
  endsAt: Date;
  applicationDeadline: Date;
  participantLimit: number;
  dataScope: "REAL" | "TEST" | "DEMO";
};

const invitationExpiresAt = (request: Pick<DispatchRequest, "applicationDeadline">, now: Date) => {
  if (request.applicationDeadline <= now) {
    throw new ApiError(409, "APPLICATION_DEADLINE_PASSED", "报名截止时间已过，不能发送邀请");
  }
  return new Date(Math.min(now.getTime() + INVITATION_TTL_MS, request.applicationDeadline.getTime()));
};

const statusEvent = (
  tx: Transaction,
  input: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    actorUserId: string | null;
    fromStatus: string | null;
    toStatus: string;
    payloadJson?: Record<string, unknown>;
    idempotencyKey?: string;
  },
) => tx.insert(statusEvents).values(input).onConflictDoNothing();

const domainEvent = (
  tx: Transaction,
  request: Pick<DispatchRequest, "id" | "schoolId" | "dataScope">,
  input: {
    actorUserId: string | null;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    sessionId?: string;
    payloadJson?: Record<string, unknown>;
    dedupeKey: string;
  },
) =>
  tx
    .insert(domainEvents)
    .values({
      schoolId: request.schoolId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      requestId: request.id,
      sessionId: input.sessionId,
      dataScope: request.dataScope,
      payloadJson: input.payloadJson ?? {},
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing();

const queueInvitationNotification = (
  tx: Transaction,
  invitation: { id: string; inviteeUserId: string; requestId: string; sessionId: string },
) => {
  const payloadJson = {
    invitationId: invitation.id,
    requestId: invitation.requestId,
    sessionId: invitation.sessionId,
  };
  assertNotificationPayloadSafe(payloadJson);
  return tx
    .insert(notificationOutbox)
    .values({
      recipientUserId: invitation.inviteeUserId,
      templateCode: "TEAM_INVITATION_PENDING",
      aggregateType: "INVITATION",
      aggregateId: invitation.id,
      payloadJson,
      idempotencyKey: `invitation:${invitation.id}:pending`,
    })
    .onConflictDoNothing();
};

const cancelActiveInvitations = async (
  tx: Transaction,
  request: DispatchRequest,
  actorUserId: string,
  now: Date,
) => {
  const active = await tx
    .select()
    .from(invitations)
    .where(and(eq(invitations.requestId, request.id), inArray(invitations.status, ["QUEUED", "PENDING"])));
  for (const invitation of active) {
    await tx.update(invitations).set({ status: "CANCELLED", updatedAt: now }).where(eq(invitations.id, invitation.id));
    await tx.update(matchCandidates).set({ candidateStatus: "SKIPPED" }).where(eq(matchCandidates.id, invitation.matchCandidateId));
    await statusEvent(tx, {
      aggregateType: "INVITATION",
      aggregateId: invitation.id,
      eventType: "INVITATION_CANCELLED_FOR_REMATCH",
      actorUserId,
      fromStatus: invitation.status,
      toStatus: "CANCELLED",
      idempotencyKey: `invitation:${invitation.id}:cancelled-for-rematch`,
    });
  }
};

export const dispatchMatchInvitations = async (
  tx: Transaction,
  request: DispatchRequest,
  candidates: DispatchCandidate[],
  now: Date,
) => {
  await cancelActiveInvitations(tx, request, request.creatorUserId, now);
  const primaryCount = candidates.filter((candidate) => candidate.candidateType === "PRIMARY").length;
  if (primaryCount === 0) {
    await tx.update(requests).set({ status: "OPEN", updatedAt: now }).where(eq(requests.id, request.id));
    await statusEvent(tx, {
      aggregateType: "REQUEST",
      aggregateId: request.id,
      eventType: "MATCHING_NO_PRIMARY",
      actorUserId: request.creatorUserId,
      fromStatus: "MATCHING",
      toStatus: "OPEN",
      idempotencyKey: `request:${request.id}:${now.toISOString()}:matching-open`,
    });
    return { sessionId: null, invitationCount: 0 };
  }

  const [existingSession] = await tx.select().from(sessions).where(eq(sessions.requestId, request.id)).limit(1);
  const [session] = existingSession
    ? [existingSession]
    : await tx
        .insert(sessions)
        .values({
          requestId: request.id,
          schoolId: request.schoolId,
          startsAt: request.startsAt,
          endsAt: request.endsAt,
        })
        .returning();
  if (!existingSession) {
    await statusEvent(tx, {
      aggregateType: "SESSION",
      aggregateId: session.id,
      eventType: "SESSION_FORMING",
      actorUserId: request.creatorUserId,
      fromStatus: null,
      toStatus: "FORMING",
      idempotencyKey: `session:${session.id}:forming`,
    });
  }

  await tx
    .insert(sessionMembers)
    .values({
      sessionId: session.id,
      userId: request.creatorUserId,
      roleSlotId: null,
      memberType: "HOST",
    })
    .onConflictDoNothing({ target: [sessionMembers.sessionId, sessionMembers.userId] });

  const inserted = await tx
    .insert(invitations)
    .values(
      candidates.map((candidate) => ({
        requestId: request.id,
        sessionId: session.id,
        matchCandidateId: candidate.id,
        inviteeUserId: candidate.userId,
        roleSlotId: candidate.roleSlotId,
        status: candidate.candidateType === "PRIMARY" ? ("PENDING" as const) : ("QUEUED" as const),
        queuePosition: candidate.rank,
        sentAt: candidate.candidateType === "PRIMARY" ? now : null,
        expiresAt: candidate.candidateType === "PRIMARY" ? invitationExpiresAt(request, now) : null,
      })),
    )
    .returning();

  await tx
    .update(matchCandidates)
    .set({ candidateStatus: "INVITED" })
    .where(inArray(matchCandidates.id, candidates.map(({ id }) => id)));

  for (const invitation of inserted) {
    await statusEvent(tx, {
      aggregateType: "INVITATION",
      aggregateId: invitation.id,
      eventType: invitation.status === "PENDING" ? "INVITATION_SENT" : "INVITATION_QUEUED",
      actorUserId: request.creatorUserId,
      fromStatus: null,
      toStatus: invitation.status,
      idempotencyKey: `invitation:${invitation.id}:created`,
    });
    if (invitation.status === "PENDING") await queueInvitationNotification(tx, invitation);
  }

  await tx.update(requests).set({ status: "INVITING", updatedAt: now }).where(eq(requests.id, request.id));
  await statusEvent(tx, {
    aggregateType: "REQUEST",
    aggregateId: request.id,
    eventType: "INVITATIONS_CREATED",
    actorUserId: request.creatorUserId,
    fromStatus: "MATCHING",
    toStatus: "INVITING",
    payloadJson: { sessionId: session.id, invitationCount: inserted.length },
    idempotencyKey: `request:${request.id}:${now.toISOString()}:matching-inviting`,
  });
  await domainEvent(tx, request, {
    actorUserId: request.creatorUserId,
    eventType: "INVITATIONS_CREATED",
    aggregateType: "REQUEST",
    aggregateId: request.id,
    sessionId: session.id,
    payloadJson: { invitationCount: inserted.length },
    dedupeKey: `request:${request.id}:${now.toISOString()}:invitations-created`,
  });
  return { sessionId: session.id, invitationCount: inserted.length };
};

const promoteNextBackup = async (
  tx: Transaction,
  request: DispatchRequest,
  invitation: typeof invitations.$inferSelect,
  now: Date,
) => {
  const [next] = await tx
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.sessionId, invitation.sessionId),
        eq(invitations.roleSlotId, invitation.roleSlotId),
        eq(invitations.status, "QUEUED"),
      ),
    )
    .orderBy(asc(invitations.queuePosition), asc(invitations.createdAt))
    .limit(1);
  if (!next) {
    const [currentRequest] = await tx.select({ status: requests.status }).from(requests).where(eq(requests.id, request.id));
    if (currentRequest?.status !== "OPEN") {
      await tx.update(requests).set({ status: "OPEN", updatedAt: now }).where(eq(requests.id, request.id));
      await statusEvent(tx, {
        aggregateType: "REQUEST",
        aggregateId: request.id,
        eventType: "BACKUP_EXHAUSTED",
        actorUserId: null,
        fromStatus: currentRequest?.status ?? null,
        toStatus: "OPEN",
        payloadJson: { roleSlotId: invitation.roleSlotId },
        idempotencyKey: `invitation:${invitation.id}:backup-exhausted`,
      });
    }
    return null;
  }

  const [promoted] = await tx
    .update(invitations)
    .set({
      status: "PENDING",
      sentAt: now,
      expiresAt: invitationExpiresAt(request, now),
      updatedAt: now,
    })
    .where(and(eq(invitations.id, next.id), eq(invitations.status, "QUEUED")))
    .returning();
  if (!promoted) return null;

  await statusEvent(tx, {
    aggregateType: "INVITATION",
    aggregateId: promoted.id,
    eventType: "BACKUP_PROMOTED",
    actorUserId: null,
    fromStatus: "QUEUED",
    toStatus: "PENDING",
    payloadJson: { actorType: "SYSTEM", replacedInvitationId: invitation.id },
    idempotencyKey: `invitation:${promoted.id}:promoted`,
  });
  await queueInvitationNotification(tx, promoted);
  await domainEvent(tx, request, {
    actorUserId: null,
    eventType: "BACKUP_PROMOTED",
    aggregateType: "INVITATION",
    aggregateId: promoted.id,
    sessionId: promoted.sessionId,
    payloadJson: { actorType: "SYSTEM", replacedInvitationId: invitation.id },
    dedupeKey: `invitation:${promoted.id}:promoted`,
  });
  return promoted;
};

const cancelRemainingInvitations = async (
  tx: Transaction,
  sessionId: string,
  acceptedInvitationId: string,
  now: Date,
) => {
  const remaining = await tx
    .select()
    .from(invitations)
    .where(and(eq(invitations.sessionId, sessionId), inArray(invitations.status, ["QUEUED", "PENDING"])));
  for (const item of remaining) {
    await tx.update(invitations).set({ status: "CANCELLED", updatedAt: now }).where(eq(invitations.id, item.id));
    await tx.update(matchCandidates).set({ candidateStatus: "SKIPPED" }).where(eq(matchCandidates.id, item.matchCandidateId));
    await statusEvent(tx, {
      aggregateType: "INVITATION",
      aggregateId: item.id,
      eventType: "INVITATION_CANCELLED_SESSION_FULL",
      actorUserId: null,
      fromStatus: item.status,
      toStatus: "CANCELLED",
      payloadJson: { actorType: "SYSTEM", acceptedInvitationId },
      idempotencyKey: `invitation:${item.id}:session-full`,
    });
  }
};

const transitionInvitation = async (
  tx: Transaction,
  invitationId: string,
  action: InvitationAction,
  actorUserId: string | null,
  now: Date,
) => {
  const [invitationSnapshot] = await tx
    .select({ sessionId: invitations.sessionId })
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .limit(1);
  if (!invitationSnapshot) return { outcome: "NOT_FOUND" as const };

  // Every invitation response for a session takes locks in the same order. This
  // serializes competing accepts before either transaction can cancel the
  // other's invitation, avoiding both overfill and a cross-invitation deadlock.
  await tx.execute(sql`select id from sessions where id = ${invitationSnapshot.sessionId} for update`);
  await tx.execute(sql`select id from invitations where id = ${invitationId} for update`);
  const [invitation] = await tx.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1);
  if (!invitation) return { outcome: "NOT_FOUND" as const };
  await tx.execute(sql`select id from request_role_slots where id = ${invitation.roleSlotId} for update`);

  const [request] = await tx
    .select({
      id: requests.id,
      creatorUserId: requests.creatorUserId,
      schoolId: requests.schoolId,
      startsAt: requests.startsAt,
      endsAt: requests.endsAt,
      applicationDeadline: requests.applicationDeadline,
      participantLimit: requests.participantLimit,
      dataScope: requests.dataScope,
    })
    .from(requests)
    .where(eq(requests.id, invitation.requestId));
  if (!request) return { outcome: "NOT_FOUND" as const };

  let decision;
  try {
    decision = decideInvitationTransition(invitation.status, action, invitation.expiresAt, now);
  } catch (error) {
    if (error instanceof ApiError) return { outcome: "CONFLICT" as const, error, invitation };
    throw error;
  }
  if (decision.kind === "IDEMPOTENT") {
    return { outcome: "OK" as const, invitation, promotedInvitationId: null, sessionConfirmed: false };
  }

  const toStatus = decision.toStatus;
  if (toStatus === "DECLINED" || toStatus === "EXPIRED") {
    const [updated] = await tx
      .update(invitations)
      .set({ status: toStatus, respondedAt: toStatus === "DECLINED" ? now : null, updatedAt: now })
      .where(and(eq(invitations.id, invitation.id), eq(invitations.status, "PENDING")))
      .returning();
    if (!updated) return { outcome: "RETRY" as const };
    await tx
      .update(matchCandidates)
      .set({ candidateStatus: toStatus })
      .where(eq(matchCandidates.id, invitation.matchCandidateId));
    await statusEvent(tx, {
      aggregateType: "INVITATION",
      aggregateId: invitation.id,
      eventType: `INVITATION_${toStatus}`,
      actorUserId,
      fromStatus: "PENDING",
      toStatus,
      payloadJson: actorUserId ? {} : { actorType: "SYSTEM" },
      idempotencyKey: `invitation:${invitation.id}:${toStatus.toLowerCase()}`,
    });
    await domainEvent(tx, request, {
      actorUserId,
      eventType: `INVITATION_${toStatus}`,
      aggregateType: "INVITATION",
      aggregateId: invitation.id,
      sessionId: invitation.sessionId,
      payloadJson: actorUserId ? {} : { actorType: "SYSTEM" },
      dedupeKey: `invitation:${invitation.id}:${toStatus.toLowerCase()}`,
    });
    const promoted = await promoteNextBackup(tx, request, invitation, now);
    return {
      outcome: toStatus === "EXPIRED" && action !== "EXPIRE" ? ("EXPIRED" as const) : ("OK" as const),
      invitation: updated,
      promotedInvitationId: promoted?.id ?? null,
      sessionConfirmed: false,
    };
  }

  const [roleSlot] = await tx.select().from(requestRoleSlots).where(eq(requestRoleSlots.id, invitation.roleSlotId));
  if (!roleSlot) return { outcome: "NOT_FOUND" as const };
  const occupied = await tx
    .select({ id: sessionMembers.id })
    .from(sessionMembers)
    .where(
      and(
        eq(sessionMembers.sessionId, invitation.sessionId),
        eq(sessionMembers.roleSlotId, invitation.roleSlotId),
        inArray(sessionMembers.memberStatus, ["CONFIRMED", "COMPLETED"]),
      ),
    );
  if (occupied.length >= roleSlot.slotCount) {
    return {
      outcome: "CONFLICT" as const,
      error: new ApiError(409, "ROLE_SLOT_FULL", "该角色名额已满"),
      invitation,
    };
  }

  const [existingMembership] = await tx
    .select({ id: sessionMembers.id })
    .from(sessionMembers)
    .where(
      and(
        eq(sessionMembers.sessionId, invitation.sessionId),
        eq(sessionMembers.userId, invitation.inviteeUserId),
      ),
    );
  if (existingMembership) {
    return {
      outcome: "CONFLICT" as const,
      error: new ApiError(409, "ALREADY_SESSION_MEMBER", "你已是该局成员"),
      invitation,
    };
  }
  await tx.insert(sessionMembers).values({
    sessionId: invitation.sessionId,
    userId: invitation.inviteeUserId,
    roleSlotId: invitation.roleSlotId,
    memberType: "PARTICIPANT",
  });

  const [accepted] = await tx
    .update(invitations)
    .set({ status: "ACCEPTED", respondedAt: now, updatedAt: now })
    .where(and(eq(invitations.id, invitation.id), eq(invitations.status, "PENDING")))
    .returning();
  await tx.update(matchCandidates).set({ candidateStatus: "ACCEPTED" }).where(eq(matchCandidates.id, invitation.matchCandidateId));
  await statusEvent(tx, {
    aggregateType: "INVITATION",
    aggregateId: invitation.id,
    eventType: "INVITATION_ACCEPTED",
    actorUserId,
    fromStatus: "PENDING",
    toStatus: "ACCEPTED",
    idempotencyKey: `invitation:${invitation.id}:accepted`,
  });
  await domainEvent(tx, request, {
    actorUserId,
    eventType: "INVITATION_ACCEPTED",
    aggregateType: "INVITATION",
    aggregateId: invitation.id,
    sessionId: invitation.sessionId,
    dedupeKey: `invitation:${invitation.id}:accepted`,
  });

  const confirmedMembers = await tx
    .select({ id: sessionMembers.id })
    .from(sessionMembers)
    .where(
      and(
        eq(sessionMembers.sessionId, invitation.sessionId),
        inArray(sessionMembers.memberStatus, ["CONFIRMED", "COMPLETED"]),
      ),
    );
  const sessionConfirmed = isSessionFulfilled(confirmedMembers.length, request.participantLimit);
  if (sessionConfirmed) {
    await tx.update(sessions).set({ status: "CONFIRMED", updatedAt: now }).where(eq(sessions.id, invitation.sessionId));
    await tx.update(requests).set({ status: "FULFILLED", updatedAt: now }).where(eq(requests.id, request.id));
    await statusEvent(tx, {
      aggregateType: "SESSION",
      aggregateId: invitation.sessionId,
      eventType: "SESSION_CONFIRMED",
      actorUserId,
      fromStatus: "FORMING",
      toStatus: "CONFIRMED",
      idempotencyKey: `session:${invitation.sessionId}:confirmed`,
    });
    await statusEvent(tx, {
      aggregateType: "REQUEST",
      aggregateId: request.id,
      eventType: "REQUEST_FULFILLED",
      actorUserId,
      fromStatus: "INVITING",
      toStatus: "FULFILLED",
      idempotencyKey: `request:${request.id}:fulfilled`,
    });
    await cancelRemainingInvitations(tx, invitation.sessionId, invitation.id, now);
    await domainEvent(tx, request, {
      actorUserId,
      eventType: "SESSION_CONFIRMED",
      aggregateType: "SESSION",
      aggregateId: invitation.sessionId,
      sessionId: invitation.sessionId,
      dedupeKey: `session:${invitation.sessionId}:confirmed`,
    });
  }
  return { outcome: "OK" as const, invitation: accepted, promotedInvitationId: null, sessionConfirmed };
};

export const respondToInvitationInTransaction = async (
  tx: DatabaseTransaction,
  invitationId: string,
  userId: string,
  action: "ACCEPT" | "DECLINE",
  now = new Date(),
) => {
  const [visible] = await tx
    .select({ inviteeUserId: invitations.inviteeUserId })
    .from(invitations)
    .where(eq(invitations.id, invitationId));
  const result = !visible || visible.inviteeUserId !== userId
    ? { outcome: "NOT_FOUND" as const }
    : await transitionInvitation(tx, invitationId, action, userId, now);
  if (result.outcome === "NOT_FOUND") throw new ApiError(404, "INVITATION_NOT_FOUND", "邀请不存在");
  if (result.outcome === "CONFLICT") throw result.error;
  if (result.outcome === "RETRY") throw new ApiError(409, "INVITATION_CHANGED", "邀请状态已变化，请刷新后重试");
  if (result.outcome === "EXPIRED") throw new ApiError(409, "INVITATION_EXPIRED", "邀请已过期");
  return result;
};

export const respondToInvitation = (
  db: Database,
  invitationId: string,
  userId: string,
  action: "ACCEPT" | "DECLINE",
  now = new Date(),
) => db.transaction((tx) => respondToInvitationInTransaction(tx, invitationId, userId, action, now));

export const expirePendingInvitations = async (db: Database, now = new Date()) => {
  const expired = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.status, "PENDING"), lte(invitations.expiresAt, now)))
    .orderBy(asc(invitations.expiresAt));
  const results: Array<{ invitationId: string; success: boolean; error?: string }> = [];
  for (const { id } of expired) {
    try {
      await db.transaction((tx) => transitionInvitation(tx, id, "EXPIRE", null, now));
      results.push({ invitationId: id, success: true });
    } catch (error) {
      results.push({ invitationId: id, success: false, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  return results;
};

export const listMyInvitations = async (db: Database, userId: string, status?: typeof invitations.$inferSelect.status) =>
  db
    .select({
      id: invitations.id,
      requestId: invitations.requestId,
      sessionId: invitations.sessionId,
      roleSlotId: invitations.roleSlotId,
      status: invitations.status,
      queuePosition: invitations.queuePosition,
      sentAt: invitations.sentAt,
      expiresAt: invitations.expiresAt,
      respondedAt: invitations.respondedAt,
      createdAt: invitations.createdAt,
      requestTitle: requests.title,
      competitionName: requests.competitionName,
      startsAt: requests.startsAt,
      endsAt: requests.endsAt,
      candidateType: matchCandidates.candidateType,
      score: matchCandidates.score,
      reasons: matchCandidates.reasonsJson,
    })
    .from(invitations)
    .innerJoin(requests, eq(requests.id, invitations.requestId))
    .innerJoin(matchCandidates, eq(matchCandidates.id, invitations.matchCandidateId))
    .where(status ? and(eq(invitations.inviteeUserId, userId), eq(invitations.status, status)) : eq(invitations.inviteeUserId, userId))
    .orderBy(desc(invitations.createdAt))
    .limit(20);

export const getInvitationForUser = async (db: Database, invitationId: string, userId: string) => {
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.inviteeUserId, userId)))
    .limit(1);
  if (!invitation) throw new ApiError(404, "INVITATION_NOT_FOUND", "邀请不存在");
  return invitation;
};

export const listMySessions = async (db: Database, userId: string) =>
  db
    .select({
      id: sessions.id,
      requestId: sessions.requestId,
      status: sessions.status,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      title: requests.title,
      memberStatus: sessionMembers.memberStatus,
    })
    .from(sessionMembers)
    .innerJoin(sessions, eq(sessions.id, sessionMembers.sessionId))
    .innerJoin(requests, eq(requests.id, sessions.requestId))
    .where(eq(sessionMembers.userId, userId))
    .orderBy(desc(sessions.createdAt));

export const getSessionDetail = async (db: Database, sessionId: string, auth: AuthUser) => {
  const [session] = await db
    .select({
      id: sessions.id,
      requestId: sessions.requestId,
      schoolId: sessions.schoolId,
      status: sessions.status,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      title: requests.title,
      competitionName: requests.competitionName,
    })
    .from(sessions)
    .innerJoin(requests, eq(requests.id, sessions.requestId))
    .where(eq(sessions.id, sessionId));
  if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "成局不存在");

  const [membership] = await db
    .select({ id: sessionMembers.id })
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, auth.userId)));
  const canView = Boolean(membership) || auth.role === "ADMIN" || (auth.role === "OPS" && auth.schoolId === session.schoolId);
  if (!canView) throw new ApiError(404, "SESSION_NOT_FOUND", "成局不存在");

  const members = await db
    .select({
      userId: sessionMembers.userId,
      roleSlotId: sessionMembers.roleSlotId,
      memberType: sessionMembers.memberType,
      memberStatus: sessionMembers.memberStatus,
      joinedAt: sessionMembers.joinedAt,
      displayName: userProfiles.displayName,
      avatarUrl: userProfiles.avatarUrl,
    })
    .from(sessionMembers)
    .innerJoin(userProfiles, eq(userProfiles.userId, sessionMembers.userId))
    .where(eq(sessionMembers.sessionId, sessionId));
  return { ...session, members };
};
