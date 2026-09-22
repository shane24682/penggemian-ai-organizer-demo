import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../db/client.js";
import {
  checkins, domainEvents, regroupIntents, requestRoleSlots, requests, reviews,
  sessionMembers, sessions, statusEvents, userProfiles,
} from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";
import { assertCompletedParticipant, boundedTrustScore, CHECKIN_POLICY, decideCheckin, mutuallyWillingUserIds } from "./rules.js";

type Tx = DatabaseTransaction;
type Session = typeof sessions.$inferSelect;

const lockSession = async (tx: Tx, sessionId: string) => {
  await tx.execute(sql`select id from sessions where id = ${sessionId} for update`);
  const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "活动不存在");
  return session;
};

const requireMember = async (tx: Tx, sessionId: string, userId: string) => {
  const [member] = await tx.select().from(sessionMembers).where(
    and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)),
  );
  if (!member) throw new ApiError(404, "SESSION_NOT_FOUND", "活动不存在或不可见");
  return member;
};

const event = async (
  tx: Tx, session: Session, actorUserId: string | null, eventType: string,
  aggregateType: string, aggregateId: string, dedupeKey: string,
  payloadJson: Record<string, unknown> = {},
) => {
  const [request] = await tx.select({ dataScope: requests.dataScope }).from(requests).where(eq(requests.id, session.requestId));
  if (!request) throw new Error("Session request missing");
  await tx.insert(domainEvents).values({
    schoolId: session.schoolId, actorUserId, eventType, aggregateType, aggregateId,
    requestId: session.requestId, sessionId: session.id, dataScope: request.dataScope,
    payloadJson, dedupeKey,
  }).onConflictDoNothing();
};

const transitionEvent = (tx: Tx, aggregateType: string, aggregateId: string, eventType: string,
  fromStatus: string | null, toStatus: string, actorUserId: string | null) =>
  tx.insert(statusEvents).values({
    aggregateType, aggregateId, eventType, fromStatus, toStatus, actorUserId,
    payloadJson: actorUserId ? {} : { actorType: "SYSTEM" },
    idempotencyKey: `${aggregateId}:${eventType}`,
  }).onConflictDoNothing();

const changeTrust = async (tx: Tx, session: Session, userId: string, delta: number, reason: string, now: Date) => {
  await tx.execute(sql`select user_id from user_profiles where user_id = ${userId} for update`);
  const [profile] = await tx.select({ score: userProfiles.trustScore }).from(userProfiles).where(eq(userProfiles.userId, userId));
  if (!profile) throw new Error("Member profile missing");
  const toScore = boundedTrustScore(profile.score, delta);
  await tx.update(userProfiles).set({ trustScore: toScore, updatedAt: now }).where(eq(userProfiles.userId, userId));
  await event(tx, session, null, "TRUST_SCORE_CHANGED", "USER", userId,
    `session:${session.id}:user:${userId}:trust:${reason}`,
    { reason, fromScore: profile.score, toScore, delta: toScore - profile.score, requestedDelta: delta });
};

export const submitCheckin = async (tx: Tx, sessionId: string, userId: string, now = new Date()) => {
  const session = await lockSession(tx, sessionId);
  const member = await requireMember(tx, sessionId, userId);
  const [existing] = await tx.select().from(checkins).where(and(eq(checkins.sessionId, sessionId), eq(checkins.userId, userId)));
  // Even a different HTTP idempotency key cannot add another checkin/credit.
  if (existing && existing.status !== "ABSENT") return existing;
  const status = decideCheckin(session, member.memberStatus, now);
  const [checkin] = await tx.insert(checkins).values({ sessionId, userId, status, checkedInAt: now }).returning();
  await transitionEvent(tx, "CHECKIN", checkin.id, "CHECKIN_RECORDED", null, status, userId);
  await event(tx, session, userId, "CHECKIN_RECORDED", "CHECKIN", checkin.id, `checkin:${checkin.id}`, { status });
  await changeTrust(tx, session, userId, 2, "CHECKIN", now);
  return checkin;
};

export const getCheckinSummary = (db: Database, sessionId: string, userId: string, now = new Date()) =>
  db.transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    const member = await requireMember(tx, sessionId, userId);
    let eligible = true;
    let reason: string | null = null;
    try { decideCheckin(session, member.memberStatus, now); } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      eligible = false; reason = error.code;
    }
    const records = await tx.select({ userId: checkins.userId, status: checkins.status, checkedInAt: checkins.checkedInAt })
      .from(checkins).where(eq(checkins.sessionId, sessionId));
    if (records.some((record) => record.userId === userId)) { eligible = false; reason = "ALREADY_CHECKED_IN"; }
    return {
      sessionId, sessionStatus: session.status, eligible, reason,
      opensAt: new Date(session.startsAt.getTime() - CHECKIN_POLICY.earlyMinutes * 60_000),
      closesAt: session.endsAt, lateAfter: new Date(session.startsAt.getTime() + CHECKIN_POLICY.lateMinutes * 60_000), records,
    };
  });

export type ReviewInput = { revieweeUserId: string; rating: number; tags: string[]; comment?: string | null };
export const submitReview = async (tx: Tx, sessionId: string, userId: string, input: ReviewInput) => {
  const session = await lockSession(tx, sessionId);
  const member = await requireMember(tx, sessionId, userId);
  assertCompletedParticipant(session.status, member.memberStatus);
  if (input.revieweeUserId === userId) throw new ApiError(422, "SELF_REVIEW_NOT_ALLOWED", "不能评价自己");
  const [target] = await tx.select().from(sessionMembers).where(
    and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, input.revieweeUserId)),
  );
  if (!target || target.memberStatus !== "COMPLETED") throw new ApiError(422, "INVALID_REVIEW_TARGET", "只能评价本局已到场成员");
  const [existing] = await tx.select().from(reviews).where(and(eq(reviews.sessionId, sessionId),
    eq(reviews.reviewerUserId, userId), eq(reviews.revieweeUserId, input.revieweeUserId)));
  if (existing) throw new ApiError(409, "REVIEW_ALREADY_EXISTS", "已评价该成员");
  const [review] = await tx.insert(reviews).values({ sessionId, reviewerUserId: userId,
    revieweeUserId: input.revieweeUserId, rating: input.rating, tagsJson: input.tags, comment: input.comment }).returning();
  await transitionEvent(tx, "REVIEW", review.id, "REVIEW_SUBMITTED", null, "SUBMITTED", userId);
  // Do not copy private review text/choices into public analytics events.
  await event(tx, session, userId, "REVIEW_SUBMITTED", "REVIEW", review.id, `review:${review.id}`);
  return review;
};

export const listMyReviews = (db: Database, sessionId: string, userId: string) => db.transaction(async (tx) => {
  await requireMember(tx, sessionId, userId);
  return tx.select().from(reviews).where(and(eq(reviews.sessionId, sessionId), eq(reviews.reviewerUserId, userId)));
});

const getOwnIntent = async (tx: Tx, sessionId: string, userId: string) => {
  const rows = await tx.select().from(regroupIntents).where(eq(regroupIntents.sessionId, sessionId));
  const own = rows.find((row) => row.userId === userId);
  return { intent: own ?? null, mutualUserIds: own && own.status !== "CLOSED"
    ? mutuallyWillingUserIds(userId, own.willingUserIdsJson, rows) : [] };
};

export const submitRegroupIntent = async (tx: Tx, sessionId: string, userId: string, choices: string[], now = new Date()) => {
  const session = await lockSession(tx, sessionId);
  const member = await requireMember(tx, sessionId, userId);
  assertCompletedParticipant(session.status, member.memberStatus);
  const completedMembers = await tx.select({ userId: sessionMembers.userId }).from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.memberStatus, "COMPLETED")));
  const allowed = new Set(completedMembers.map((row) => row.userId));
  if (choices.some((id) => id === userId || !allowed.has(id)) || new Set(choices).size !== choices.length) {
    throw new ApiError(422, "INVALID_REGROUP_CHOICES", "复组对象必须是本局其他已到场成员且不能重复");
  }
  const current = await getOwnIntent(tx, sessionId, userId);
  if (current.intent?.status === "CLOSED") throw new ApiError(409, "REGROUP_INTENT_CLOSED", "复组意愿已关闭");
  const [intent] = await tx.insert(regroupIntents).values({ sessionId, userId, willingUserIdsJson: choices })
    .onConflictDoUpdate({ target: [regroupIntents.sessionId, regroupIntents.userId],
      set: { willingUserIdsJson: choices, updatedAt: now } }).returning();
  if (!current.intent) await transitionEvent(tx, "REGROUP_INTENT", intent.id, "REGROUP_INTENT_CREATED", null, "OPEN", userId);
  const all = await tx.select().from(regroupIntents).where(eq(regroupIntents.sessionId, sessionId));
  for (const row of all) {
    if (row.status === "CLOSED") continue;
    const status = mutuallyWillingUserIds(row.userId, row.willingUserIdsJson, all).length ? "MATCHED" : "OPEN";
    if (status !== row.status || row.id === intent.id) {
      await tx.update(regroupIntents).set({ status, updatedAt: now }).where(eq(regroupIntents.id, row.id));
      if (status !== row.status) {
        await tx.insert(statusEvents).values({ aggregateType: "REGROUP_INTENT", aggregateId: row.id,
          eventType: "REGROUP_INTENT_STATUS_CHANGED", fromStatus: row.status, toStatus: status, actorUserId: userId });
      }
    }
  }
  await event(tx, session, userId, "REGROUP_INTENT_SUBMITTED", "REGROUP_INTENT", intent.id,
    `regroup-intent:${intent.id}:${randomUUID()}`);
  return getOwnIntent(tx, sessionId, userId);
};

export const getMyRegroupIntent = (db: Database, sessionId: string, userId: string) => db.transaction(async (tx) => {
  await requireMember(tx, sessionId, userId);
  return getOwnIntent(tx, sessionId, userId);
});

export type RegroupInput = { startsAt: Date; endsAt: Date; applicationDeadline: Date };
export const createRegroupRequest = async (tx: Tx, sessionId: string, userId: string, input: RegroupInput, now = new Date()) => {
  const session = await lockSession(tx, sessionId);
  const member = await requireMember(tx, sessionId, userId);
  assertCompletedParticipant(session.status, member.memberStatus);
  // A different HTTP key must not duplicate the same member's regroup request.
  const [existing] = await tx.select().from(requests).where(and(eq(requests.sourceSessionId, sessionId),
    eq(requests.creatorUserId, userId), isNull(requests.deletedAt)));
  if (existing) return existing;
  const own = await getOwnIntent(tx, sessionId, userId);
  if (!own.mutualUserIds.length) throw new ApiError(409, "REGROUP_NOT_MATCHED", "尚无双方确认的复组意愿");
  if (input.startsAt <= now || input.endsAt <= input.startsAt || input.applicationDeadline <= now || input.applicationDeadline > input.startsAt) {
    throw new ApiError(422, "INVALID_REGROUP_TIME", "新活动及报名截止时间必须在未来且先后顺序正确");
  }
  const [source] = await tx.select().from(requests).where(eq(requests.id, session.requestId));
  const slots = await tx.select().from(requestRoleSlots).where(eq(requestRoleSlots.requestId, session.requestId));
  if (!source || !slots.length) throw new Error("Source request/slots missing");
  const [created] = await tx.insert(requests).values({ schoolId: session.schoolId, creatorUserId: userId,
    competitionName: source.competitionName, title: source.title, description: source.description,
    weeklyHoursRequired: source.weeklyHoursRequired, participantLimit: source.participantLimit,
    ...input, sourceChannel: "REGROUP", sourceSessionId: sessionId, dataScope: source.dataScope }).returning();
  await tx.insert(requestRoleSlots).values(slots.map((slot) => ({ requestId: created.id, roleCode: slot.roleCode,
    slotCount: slot.slotCount, minLevel: slot.minLevel, evidenceRequired: slot.evidenceRequired })));
  await transitionEvent(tx, "REQUEST", created.id, "REGROUP_REQUEST_CREATED", null, "OPEN", userId);
  await event(tx, session, userId, "REGROUP_REQUEST_CREATED", "REQUEST", created.id,
    `regroup-request:${created.id}`, { sourceSessionId: sessionId, newRequestId: created.id });
  await tx.insert(domainEvents).values({ schoolId: session.schoolId, actorUserId: userId,
    eventType: "REQUEST_CREATED_FROM_REGROUP", aggregateType: "REQUEST", aggregateId: created.id,
    requestId: created.id, sessionId, dataScope: created.dataScope,
    payloadJson: { sourceSessionId: sessionId }, dedupeKey: `request:${created.id}:created-from-regroup` });
  // Mutual intent is consent to re-form, not permission to auto-accept invitations.
  return created;
};

export const advanceSessionInTransaction = async (tx: Tx, sessionId: string, now: Date) => {
  let session = await lockSession(tx, sessionId);
  if (session.status === "CONFIRMED" && now >= session.startsAt) {
    await tx.update(sessions).set({ status: "IN_PROGRESS", updatedAt: now }).where(eq(sessions.id, sessionId));
    await transitionEvent(tx, "SESSION", sessionId, "SESSION_STARTED", "CONFIRMED", "IN_PROGRESS", null);
    await event(tx, session, null, "SESSION_STARTED", "SESSION", sessionId, `session:${sessionId}:started`);
    session = { ...session, status: "IN_PROGRESS" };
  }
  if (session.status !== "IN_PROGRESS" || now < session.endsAt) return { sessionId, status: session.status };
  const members = await tx.select().from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.memberStatus, "CONFIRMED")))
    .orderBy(asc(sessionMembers.userId));
  const attendance = await tx.select().from(checkins).where(eq(checkins.sessionId, sessionId));
  for (const member of members) {
    const attended = attendance.some((row) => row.userId === member.userId && row.status !== "ABSENT");
    const status = attended ? "COMPLETED" : "NO_SHOW";
    if (!attended) {
      const [absent] = await tx.insert(checkins).values({ sessionId, userId: member.userId, status: "ABSENT" })
        .onConflictDoNothing().returning();
      if (absent) {
        await transitionEvent(tx, "CHECKIN", absent.id, "CHECKIN_ABSENT", null, "ABSENT", null);
        await event(tx, session, null, "CHECKIN_ABSENT", "CHECKIN", absent.id, `checkin:${absent.id}:absent`);
      }
      await changeTrust(tx, session, member.userId, -10, "NO_SHOW", now);
    }
    await tx.update(sessionMembers).set({ memberStatus: status, updatedAt: now }).where(eq(sessionMembers.id, member.id));
    await transitionEvent(tx, "SESSION_MEMBER", member.id, `MEMBER_${status}`, "CONFIRMED", status, null);
    await event(tx, session, null, `MEMBER_${status}`, "SESSION_MEMBER", member.id, `member:${member.id}:${status}`);
  }
  await tx.update(sessions).set({ status: "COMPLETED", updatedAt: now }).where(eq(sessions.id, sessionId));
  await transitionEvent(tx, "SESSION", sessionId, "SESSION_COMPLETED", "IN_PROGRESS", "COMPLETED", null);
  await event(tx, session, null, "SESSION_COMPLETED", "SESSION", sessionId, `session:${sessionId}:completed`);
  return { sessionId, status: "COMPLETED" as const };
};

export const advanceDueSessions = async (db: Database, now = new Date()) => {
  const due = await db.select({ id: sessions.id }).from(sessions).where(or(
    and(eq(sessions.status, "CONFIRMED"), lte(sessions.startsAt, now)),
    and(eq(sessions.status, "IN_PROGRESS"), lte(sessions.endsAt, now)),
  )).orderBy(asc(sessions.startsAt)).limit(100);
  const results: Array<{ sessionId: string; success: boolean; error?: string }> = [];
  for (const { id } of due) {
    try { await db.transaction((tx) => advanceSessionInTransaction(tx, id, now)); results.push({ sessionId: id, success: true }); }
    catch (error) { results.push({ sessionId: id, success: false, error: error instanceof Error ? error.message : "Unknown error" }); }
  }
  return results;
};
