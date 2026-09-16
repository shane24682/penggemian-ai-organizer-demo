import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { deliveryAttempts, notificationOutbox } from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";

type OutboxRow = typeof notificationOutbox.$inferSelect;
export type NotificationSender = (notification: OutboxRow) => Promise<void>;

const MAX_ATTEMPTS = 3;
const sensitivePayloadKey = /(phone|password|secret|token|evidence|credential)/i;

export const assertNotificationPayloadSafe = (value: unknown, path = "payload"): void => {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNotificationPayloadSafe(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitivePayloadKey.test(key)) throw new Error(`Sensitive notification field rejected: ${path}.${key}`);
    assertNotificationPayloadSafe(child, `${path}.${key}`);
  }
};

export const nextNotificationAttemptAt = (failedAttemptNo: number, now: Date) => {
  if (failedAttemptNo === 1) return new Date(now.getTime() + 60_000);
  if (failedAttemptNo === 2) return new Date(now.getTime() + 5 * 60_000);
  return null;
};

export const processNotificationOutbox = async (
  db: Database,
  sender: NotificationSender = async () => undefined,
  now = new Date(),
) => {
  const due = await db
    .select({ id: notificationOutbox.id })
    .from(notificationOutbox)
    .where(
      and(
        inArray(notificationOutbox.status, ["QUEUED", "FAILED"]),
        lte(notificationOutbox.availableAt, now),
        lt(notificationOutbox.attemptCount, MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(notificationOutbox.availableAt), asc(notificationOutbox.createdAt))
    .limit(100);

  const results: Array<{ outboxId: string; status: "SENT" | "FAILED" | "DEAD" | "SKIPPED" }> = [];
  for (const { id } of due) {
    const claimed = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from notification_outbox where id = ${id} for update`);
      const [notification] = await tx.select().from(notificationOutbox).where(eq(notificationOutbox.id, id));
      if (
        !notification ||
        !["QUEUED", "FAILED"].includes(notification.status) ||
        notification.availableAt > now ||
        notification.attemptCount >= MAX_ATTEMPTS
      ) {
        return null;
      }
      assertNotificationPayloadSafe(notification.payloadJson);
      const attemptNo = notification.attemptCount + 1;
      const [attempt] = await tx
        .insert(deliveryAttempts)
        .values({ outboxId: id, attemptNo, status: "PROCESSING", startedAt: now })
        .returning({ id: deliveryAttempts.id });
      await tx
        .update(notificationOutbox)
        .set({ status: "PROCESSING", attemptCount: attemptNo, updatedAt: now })
        .where(eq(notificationOutbox.id, id));
      return { notification, attemptId: attempt.id, attemptNo };
    });
    if (!claimed) {
      results.push({ outboxId: id, status: "SKIPPED" });
      continue;
    }

    try {
      await sender(claimed.notification);
      await db.transaction(async (tx) => {
        await tx
          .update(deliveryAttempts)
          .set({ status: "SUCCEEDED", finishedAt: now })
          .where(eq(deliveryAttempts.id, claimed.attemptId));
        await tx
          .update(notificationOutbox)
          .set({ status: "SENT", sentAt: now, lastError: null, updatedAt: now })
          .where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.status, "PROCESSING")));
      });
      results.push({ outboxId: id, status: "SENT" });
    } catch (error) {
      const retryAt = nextNotificationAttemptAt(claimed.attemptNo, now);
      const finalStatus = retryAt ? "FAILED" : "DEAD";
      const errorDetail = (error instanceof Error ? error.message : "Unknown notification error").slice(0, 2000);
      const errorCode = error instanceof Error && error.name ? error.name.slice(0, 128) : "DELIVERY_FAILED";
      await db.transaction(async (tx) => {
        await tx
          .update(deliveryAttempts)
          .set({ status: "FAILED", finishedAt: now, errorCode, errorDetail })
          .where(eq(deliveryAttempts.id, claimed.attemptId));
        await tx
          .update(notificationOutbox)
          .set({
            status: finalStatus,
            availableAt: retryAt ?? now,
            lastError: errorDetail,
            updatedAt: now,
          })
          .where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.status, "PROCESSING")));
      });
      results.push({ outboxId: id, status: finalStatus });
    }
  }
  return results;
};

export const listMyNotifications = (db: Database, userId: string) =>
  db
    .select({
      id: notificationOutbox.id,
      templateCode: notificationOutbox.templateCode,
      aggregateType: notificationOutbox.aggregateType,
      aggregateId: notificationOutbox.aggregateId,
      payload: notificationOutbox.payloadJson,
      sentAt: notificationOutbox.sentAt,
      readAt: notificationOutbox.readAt,
      createdAt: notificationOutbox.createdAt,
    })
    .from(notificationOutbox)
    .where(and(eq(notificationOutbox.recipientUserId, userId), eq(notificationOutbox.status, "SENT")))
    .orderBy(desc(notificationOutbox.createdAt))
    .limit(20);

export const markNotificationRead = async (db: Database, notificationId: string, userId: string, now = new Date()) => {
  const [updated] = await db
    .update(notificationOutbox)
    .set({ readAt: now, updatedAt: now })
    .where(
      and(
        eq(notificationOutbox.id, notificationId),
        eq(notificationOutbox.recipientUserId, userId),
        eq(notificationOutbox.status, "SENT"),
      ),
    )
    .returning({ id: notificationOutbox.id, readAt: notificationOutbox.readAt });
  if (!updated) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "通知不存在");
  return updated;
};
