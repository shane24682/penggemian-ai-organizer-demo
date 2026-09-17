import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseTransaction } from "../db/client.js";
import { costItems, domainEvents, opsWorkLogs, requests, sessions } from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";
import type { AuthUser } from "../http/types.js";

const common = { requestId: z.string().uuid(), sessionId: z.string().uuid().optional(),
  reason: z.string().trim().min(1).max(1000) };
export const opsActionSchema = z.discriminatedUnion("actionType", [
  z.object({ ...common, actionType: z.literal("LOG_WORK"), minutesSpent: z.number().int().positive().max(1440) }).strict(),
  z.object({ ...common, actionType: z.literal("RECORD_COST"), costType: z.string().trim().min(1).max(96),
    amountCents: z.number().int().min(0).max(2147483647), incurredAt: z.coerce.date() }).strict(),
]);

// Append-only recording; this endpoint does not force business state changes.
export const recordOpsAction = async (tx: DatabaseTransaction, auth: AuthUser, input: z.infer<typeof opsActionSchema>) => {
  if (auth.role === "USER") throw new ApiError(403, "OPS_ACCESS_REQUIRED", "仅运营或管理员可记录运营数据");
  const [request] = await tx.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
  if (!request || request.deletedAt || (auth.role === "OPS" && request.schoolId !== auth.schoolId)) {
    throw new ApiError(404, "FLOW_NOT_FOUND", "流程不存在或不可访问");
  }
  if (input.sessionId) {
    const [session] = await tx.select({ id: sessions.id }).from(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.requestId, input.requestId), eq(sessions.schoolId, request.schoolId))).limit(1);
    if (!session) throw new ApiError(422, "SESSION_REQUEST_MISMATCH", "活动必须属于当前需求");
  }
  const [record] = input.actionType === "LOG_WORK"
    ? await tx.insert(opsWorkLogs).values({ opsUserId: auth.userId, requestId: request.id, sessionId: input.sessionId,
      actionType: "FOLLOW_UP", minutesSpent: input.minutesSpent, note: input.reason }).returning()
    : await tx.insert(costItems).values({ schoolId: request.schoolId, requestId: request.id, sessionId: input.sessionId,
      costType: input.costType, amountCents: input.amountCents, currency: "CNY", incurredAt: input.incurredAt, note: input.reason }).returning();
  await tx.insert(domainEvents).values({ schoolId: request.schoolId, actorUserId: auth.userId,
    eventType: input.actionType === "LOG_WORK" ? "OPS_WORK_RECORDED" : "OPS_COST_RECORDED",
    aggregateType: input.actionType === "LOG_WORK" ? "OPS_WORK_LOG" : "COST_ITEM", aggregateId: record.id,
    requestId: request.id, sessionId: input.sessionId, dataScope: request.dataScope,
    payloadJson: { actionType: input.actionType, reason: input.reason, recordId: record.id }, dedupeKey: `ops-record:${record.id}` });
  return { actionType: input.actionType, record };
};
