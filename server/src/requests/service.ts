import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../db/client.js";
import {
  domainEvents,
  invitations,
  matchCandidates,
  notificationOutbox,
  requests,
  sessions,
  statusEvents,
} from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";

const cancellableStatuses = ["DRAFT", "OPEN", "MATCHING", "INVITING"] as const;

export const cancelRequest = async (db: Database, requestId: string, userId: string, now = new Date()) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select id from requests where id = ${requestId} for update`);
    const [request] = await tx.select().from(requests).where(eq(requests.id, requestId)).limit(1);
    if (!request || request.creatorUserId !== userId || request.deletedAt) {
      throw new ApiError(404, "REQUEST_NOT_FOUND", "需求不存在");
    }
    if (request.status === "CANCELLED") return request;
    if (!cancellableStatuses.includes(request.status as (typeof cancellableStatuses)[number])) {
      throw new ApiError(409, "REQUEST_NOT_CANCELLABLE", "当前需求状态不能取消", { status: request.status });
    }

    const activeInvitations = await tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.requestId, requestId), inArray(invitations.status, ["QUEUED", "PENDING"])));
    for (const invitation of activeInvitations) {
      await tx
        .update(invitations)
        .set({ status: "CANCELLED", updatedAt: now })
        .where(eq(invitations.id, invitation.id));
      await tx
        .update(matchCandidates)
        .set({ candidateStatus: "SKIPPED" })
        .where(eq(matchCandidates.id, invitation.matchCandidateId));
      await tx
        .insert(statusEvents)
        .values({
          aggregateType: "INVITATION",
          aggregateId: invitation.id,
          eventType: "INVITATION_CANCELLED_WITH_REQUEST",
          actorUserId: userId,
          fromStatus: invitation.status,
          toStatus: "CANCELLED",
          idempotencyKey: `invitation:${invitation.id}:request-cancelled`,
        })
        .onConflictDoNothing();
      if (invitation.status === "PENDING") {
        await tx
          .update(notificationOutbox)
          .set({
            status: "DEAD",
            updatedAt: now,
            lastError: "Invitation cancelled with request before delivery",
          })
          .where(
            and(
              eq(notificationOutbox.aggregateId, invitation.id),
              inArray(notificationOutbox.status, ["QUEUED", "FAILED"]),
            ),
          );
        await tx
          .insert(notificationOutbox)
          .values({
            recipientUserId: invitation.inviteeUserId,
            templateCode: "TEAM_INVITATION_CANCELLED",
            aggregateType: "INVITATION",
            aggregateId: invitation.id,
            payloadJson: { invitationId: invitation.id, requestId, sessionId: invitation.sessionId },
            idempotencyKey: `invitation:${invitation.id}:cancelled`,
          })
          .onConflictDoNothing();
      }
    }

    const [session] = await tx.select().from(sessions).where(eq(sessions.requestId, requestId)).limit(1);
    if (session?.status === "FORMING") {
      await tx.update(sessions).set({ status: "CANCELLED", updatedAt: now }).where(eq(sessions.id, session.id));
      await tx
        .insert(statusEvents)
        .values({
          aggregateType: "SESSION",
          aggregateId: session.id,
          eventType: "SESSION_CANCELLED_WITH_REQUEST",
          actorUserId: userId,
          fromStatus: "FORMING",
          toStatus: "CANCELLED",
          idempotencyKey: `session:${session.id}:request-cancelled`,
        })
        .onConflictDoNothing();
    }

    const [cancelled] = await tx
      .update(requests)
      .set({ status: "CANCELLED", updatedAt: now })
      .where(eq(requests.id, requestId))
      .returning();
    await tx
      .insert(statusEvents)
      .values({
        aggregateType: "REQUEST",
        aggregateId: requestId,
        eventType: "REQUEST_CANCELLED",
        actorUserId: userId,
        fromStatus: request.status,
        toStatus: "CANCELLED",
        idempotencyKey: `request:${requestId}:cancelled`,
      })
      .onConflictDoNothing();
    await tx
      .insert(domainEvents)
      .values({
        schoolId: request.schoolId,
        actorUserId: userId,
        eventType: "REQUEST_CANCELLED",
        aggregateType: "REQUEST",
        aggregateId: requestId,
        requestId,
        sessionId: session?.id,
        dataScope: request.dataScope,
        dedupeKey: `request:${requestId}:cancelled`,
      })
      .onConflictDoNothing();
    return cancelled;
  });
