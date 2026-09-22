import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import {
  domainEvents,
  requestRoleSlots,
  requests,
  sessionMembers,
  sessions,
  statusEvents,
  users,
} from "../db/schema/index.js";
import { ApiError, isPostgresError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { parseJson } from "../http/validation.js";
import { requireIdempotencyKey, runIdempotentTransaction } from "../idempotency/service.js";
import { cancelRequest } from "../requests/service.js";

const roleSlotSchema = z.object({
  roleCode: z.enum(["MODELING", "CODING", "WRITING", "OPEN"]),
  slotCount: z.number().int().min(1).max(2),
  minLevel: z.number().int().min(1).max(5),
  evidenceRequired: z.boolean().default(false),
});

const createRequestSchema = z
  .object({
    competitionName: z.string().min(1).max(128),
    title: z.string().min(1).max(100),
    description: z.string().max(1000).nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    weeklyHoursRequired: z.number().int().min(0).max(80),
    participantLimit: z.number().int().min(2).max(3).default(3),
    applicationDeadline: z.coerce.date(),
    sourceChannel: z.string().min(1).max(64).default("DIRECT"),
    sourceSessionId: z.string().uuid().nullable().optional(),
    roleSlots: z.array(roleSlotSchema).min(1).max(3),
  })
  .superRefine((input, context) => {
    if (input.endsAt <= input.startsAt) {
      context.addIssue({ code: "custom", path: ["endsAt"], message: "结束时间必须晚于开始时间" });
    }
    if (input.applicationDeadline > input.startsAt) {
      context.addIssue({ code: "custom", path: ["applicationDeadline"], message: "报名截止时间不能晚于开始时间" });
    }
    if (1 + input.roleSlots.reduce((total, slot) => total + slot.slotCount, 0) !== input.participantLimit) {
      context.addIssue({ code: "custom", path: ["roleSlots"], message: "角色空位总数加发起人必须等于队伍人数" });
    }
    if (new Set(input.roleSlots.map((slot) => slot.roleCode)).size !== input.roleSlots.length) {
      context.addIssue({ code: "custom", path: ["roleSlots"], message: "同一角色不能重复" });
    }
  });

const canViewRequest = (
  auth: { userId: string; schoolId: string; role: "USER" | "OPS" | "ADMIN" },
  request: { creatorUserId: string; schoolId: string },
) =>
  auth.userId === request.creatorUserId || auth.role === "ADMIN" || (auth.role === "OPS" && auth.schoolId === request.schoolId);

const activeRequestStatuses = ["DRAFT", "OPEN", "MATCHING", "INVITING"] as const;
const createRequestRouteKey = "POST:/api/v1/requests";

export const createRequestRoutes = (config: AppConfig, db: Database) => {
  const routes = new Hono<AppEnv>();

  routes.post("/requests", async (context) => {
    const auth = context.get("auth");
    const idempotencyKey = requireIdempotencyKey(context.req.header("Idempotency-Key"));
    const input = await parseJson(context, createRequestSchema);
    try {
      const outcome = await runIdempotentTransaction(
        db,
        {
          userId: auth.userId,
          routeKey: createRequestRouteKey,
          idempotencyKey,
          request: input,
        },
        async (tx) => {
        await tx.execute(sql`select id from ${users} where ${users.id} = ${auth.userId} for update`);

        const activeRequests = await tx
          .select({
            id: requests.id,
            sceneCode: requests.sceneCode,
            competitionName: requests.competitionName,
            startsAt: requests.startsAt,
            endsAt: requests.endsAt,
          })
          .from(requests)
          .where(
            and(
              eq(requests.creatorUserId, auth.userId),
              inArray(requests.status, activeRequestStatuses),
              isNull(requests.deletedAt),
            ),
          );
        const duplicate = activeRequests.find(
          (request) =>
            request.sceneCode === "MATH_MODELING" &&
            request.competitionName === input.competitionName &&
            request.startsAt.getTime() === input.startsAt.getTime() &&
            request.endsAt.getTime() === input.endsAt.getTime(),
        );
        if (duplicate) {
          throw new ApiError(409, "DUPLICATE_ACTIVE_REQUEST", "相同需求已存在", { requestId: duplicate.id });
        }
        const overlap = activeRequests.find(
          (request) => request.startsAt < input.endsAt && request.endsAt > input.startsAt,
        );
        if (overlap) {
          throw new ApiError(409, "REQUEST_TIME_CONFLICT", "该时间段已有进行中的需求", {
            requestId: overlap.id,
          });
        }
        if (activeRequests.length >= 3) {
          throw new ApiError(409, "ACTIVE_REQUEST_LIMIT_REACHED", "同时进行的需求最多为3条");
        }

        const [created] = await tx
          .insert(requests)
          .values({
            schoolId: auth.schoolId,
            creatorUserId: auth.userId,
            competitionName: input.competitionName,
            title: input.title,
            description: input.description,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            weeklyHoursRequired: input.weeklyHoursRequired,
            participantLimit: input.participantLimit,
            applicationDeadline: input.applicationDeadline,
            sourceChannel: input.sourceChannel,
            sourceSessionId: input.sourceSessionId,
            dataScope: config.appEnv === "production" ? "REAL" : "TEST",
          })
          .returning();
        const slots = await tx
          .insert(requestRoleSlots)
          .values(input.roleSlots.map((slot) => ({ requestId: created.id, ...slot })))
          .returning();
        await tx.insert(statusEvents).values({
          aggregateType: "REQUEST",
          aggregateId: created.id,
          eventType: "REQUEST_OPENED",
          actorUserId: auth.userId,
          fromStatus: null,
          toStatus: "OPEN",
          idempotencyKey: `request:${created.id}:opened`,
        });
        await tx.insert(domainEvents).values({
          schoolId: created.schoolId,
          actorUserId: auth.userId,
          eventType: "REQUEST_OPENED",
          aggregateType: "REQUEST",
          aggregateId: created.id,
          requestId: created.id,
          dataScope: created.dataScope,
          payloadJson: { sceneCode: created.sceneCode, sourceChannel: created.sourceChannel },
          dedupeKey: `request:${created.id}:opened`,
        });
        const request = { ...created, roleSlots: slots };
          return { data: request, status: 201 };
        },
      );
      return success(context, outcome.data, outcome.status);
    } catch (error) {
      if (isPostgresError(error, "23505")) {
        throw new ApiError(409, "DUPLICATE_ACTIVE_REQUEST", "相同需求已存在");
      }
      throw error;
    }
  });

  routes.get("/me/requests", async (context) => {
    const auth = context.get("auth");
    const rows = await db
      .select()
      .from(requests)
      .where(and(eq(requests.creatorUserId, auth.userId), isNull(requests.deletedAt)))
      .orderBy(desc(requests.createdAt))
      .limit(100);
    return success(context, rows);
  });

  routes.get("/requests/:requestId", async (context) => {
    const auth = context.get("auth");
    const requestId = context.req.param("requestId");
    if (!z.string().uuid().safeParse(requestId).success) {
      throw new ApiError(400, "INVALID_REQUEST_ID", "需求编号格式错误");
    }

    const [request] = await db
      .select()
      .from(requests)
      .where(and(eq(requests.id, requestId), isNull(requests.deletedAt)))
      .limit(1);
    if (!request) {
      throw new ApiError(404, "REQUEST_NOT_FOUND", "需求不存在");
    }
    let canView = canViewRequest(auth, request);
    if (!canView) {
      const [membership] = await db
        .select({ id: sessionMembers.id })
        .from(sessionMembers)
        .innerJoin(sessions, eq(sessions.id, sessionMembers.sessionId))
        .where(and(eq(sessions.requestId, requestId), eq(sessionMembers.userId, auth.userId)))
        .limit(1);
      canView = Boolean(membership);
    }
    if (!canView) throw new ApiError(404, "REQUEST_NOT_FOUND", "需求不存在");
    const slots = await db.select().from(requestRoleSlots).where(eq(requestRoleSlots.requestId, request.id));
    return success(context, { ...request, roleSlots: slots });
  });

  routes.post("/requests/:requestId/cancel", async (context) => {
    const auth = context.get("auth");
    const requestId = context.req.param("requestId");
    if (!z.string().uuid().safeParse(requestId).success) {
      throw new ApiError(400, "INVALID_REQUEST_ID", "需求编号格式错误");
    }
    return success(context, await cancelRequest(db, requestId, auth.userId));
  });

  return routes;
};
