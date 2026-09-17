import { Hono } from "hono";
import { z } from "zod";

import type { Database } from "../db/client.js";
import {
  createRegroupRequest, getCheckinSummary, getMyRegroupIntent, listMyReviews,
  submitCheckin, submitRegroupIntent, submitReview,
} from "../fulfillment/service.js";
import { ApiError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { parseJson } from "../http/validation.js";
import { requireIdempotencyKey, runIdempotentTransaction } from "../idempotency/service.js";

const checkinSchema = z.object({}).strict();
const reviewSchema = z.object({
  revieweeUserId: z.string().uuid(), rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(64)).max(10).default([]),
  comment: z.string().trim().max(1000).nullable().default(null),
}).strict();
const intentSchema = z.object({ willingUserIds: z.array(z.string().uuid()).max(2) }).strict();
const regroupSchema = z.object({
  startsAt: z.coerce.date(), endsAt: z.coerce.date(), applicationDeadline: z.coerce.date(),
}).strict();

export const createFulfillmentRoutes = (db: Database) => {
  const routes = new Hono<AppEnv>();
  routes.use("/sessions/:sessionId/*", async (context, next) => {
    if (!z.string().uuid().safeParse(context.req.param("sessionId")).success) {
      throw new ApiError(400, "INVALID_SESSION_ID", "活动编号格式错误");
    }
    if (context.req.method === "POST" && !context.req.header("Content-Type")?.toLowerCase().startsWith("application/json")) {
      throw new ApiError(400, "JSON_CONTENT_TYPE_REQUIRED", "请求必须使用 application/json");
    }
    await next();
  });

  routes.get("/sessions/:sessionId/checkins", async (c) =>
    success(c, await getCheckinSummary(db, c.req.param("sessionId"), c.get("auth").userId)));
  routes.get("/sessions/:sessionId/reviews", async (c) =>
    success(c, await listMyReviews(db, c.req.param("sessionId"), c.get("auth").userId)));
  routes.get("/sessions/:sessionId/regroup-intents", async (c) =>
    success(c, await getMyRegroupIntent(db, c.req.param("sessionId"), c.get("auth").userId)));

  routes.post("/sessions/:sessionId/checkins", async (c) => {
    const input = await parseJson(c, checkinSchema);
    const sessionId = c.req.param("sessionId");
    const userId = c.get("auth").userId;
    const result = await runIdempotentTransaction(db, {
      userId, routeKey: "POST:/api/v1/sessions/:sessionId/checkins",
      idempotencyKey: requireIdempotencyKey(c.req.header("Idempotency-Key")), request: { sessionId, ...input },
    }, async (tx) => ({ data: await submitCheckin(tx, sessionId, userId) }));
    c.header("Idempotency-Replayed", String(result.replayed));
    return success(c, result.data, result.status);
  });
  routes.post("/sessions/:sessionId/reviews", async (c) => {
    const input = await parseJson(c, reviewSchema);
    const sessionId = c.req.param("sessionId");
    const userId = c.get("auth").userId;
    const result = await runIdempotentTransaction(db, {
      userId, routeKey: "POST:/api/v1/sessions/:sessionId/reviews",
      idempotencyKey: requireIdempotencyKey(c.req.header("Idempotency-Key")), request: { sessionId, ...input },
    }, async (tx) => ({ data: await submitReview(tx, sessionId, userId, input), status: 201 }));
    c.header("Idempotency-Replayed", String(result.replayed));
    return success(c, result.data, result.status);
  });
  routes.post("/sessions/:sessionId/regroup-intents", async (c) => {
    const input = await parseJson(c, intentSchema);
    const sessionId = c.req.param("sessionId");
    const userId = c.get("auth").userId;
    const result = await runIdempotentTransaction(db, {
      userId, routeKey: "POST:/api/v1/sessions/:sessionId/regroup-intents",
      idempotencyKey: requireIdempotencyKey(c.req.header("Idempotency-Key")), request: { sessionId, ...input },
    }, async (tx) => ({ data: await submitRegroupIntent(tx, sessionId, userId, input.willingUserIds) }));
    c.header("Idempotency-Replayed", String(result.replayed));
    return success(c, result.data, result.status);
  });
  routes.post("/sessions/:sessionId/regroup", async (c) => {
    const input = await parseJson(c, regroupSchema);
    const sessionId = c.req.param("sessionId");
    const userId = c.get("auth").userId;
    const result = await runIdempotentTransaction(db, {
      userId, routeKey: "POST:/api/v1/sessions/:sessionId/regroup",
      idempotencyKey: requireIdempotencyKey(c.req.header("Idempotency-Key")), request: { sessionId, ...input },
    }, async (tx) => ({ data: await createRegroupRequest(tx, sessionId, userId, input), status: 201 }));
    c.header("Idempotency-Replayed", String(result.replayed));
    return success(c, result.data, result.status);
  });
  return routes;
};
