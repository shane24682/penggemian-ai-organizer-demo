import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { requestRoleSlots, requests } from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { parseJson } from "../http/validation.js";
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

export const createRequestRoutes = (config: AppConfig, db: Database) => {
  const routes = new Hono<AppEnv>();

  routes.post("/requests", async (context) => {
    const auth = context.get("auth");
    const input = await parseJson(context, createRequestSchema);
    const request = await db.transaction(async (tx) => {
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
      return { ...created, roleSlots: slots };
    });
    return success(context, request, 201);
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
    if (!request || !canViewRequest(auth, request)) {
      throw new ApiError(404, "REQUEST_NOT_FOUND", "需求不存在");
    }
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
