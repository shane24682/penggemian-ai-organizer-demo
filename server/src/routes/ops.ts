import { Hono } from "hono";
import { z } from "zod";

import type { Database } from "../db/client.js";
import { ApiError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { getOpsFlowDetail, listOpsFlows } from "../ops/flows.js";
import { getOpsMetrics } from "../ops/metrics.js";
import { opsActionSchema, recordOpsAction } from "../ops/actions.js";
import { parseJson } from "../http/validation.js";
import { requireIdempotencyKey, runIdempotentTransaction } from "../idempotency/service.js";

const metricsQuerySchema = z.object({
  schoolId: z.string().uuid().optional(),
  sceneCode: z.enum(["MATH_MODELING"]).default("MATH_MODELING"),
  sourceChannel: z.string().min(1).max(64).optional(),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

const flowQuerySchema = z.object({
  schoolId: z.string().uuid().optional(),
  sceneCode: z.enum(["MATH_MODELING"]).default("MATH_MODELING"),
  sourceChannel: z.string().min(1).max(64).optional(),
  status: z.enum(["DRAFT", "OPEN", "MATCHING", "INVITING", "FULFILLED", "CANCELLED", "EXPIRED"]).optional(),
  dataScope: z.enum(["REAL", "TEST", "DEMO"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  cursor: z.string().uuid().optional(),
  exceptionsOnly: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

const requireOps = (role: "USER" | "OPS" | "ADMIN") => {
  if (role === "USER") {
    throw new ApiError(403, "OPS_ACCESS_REQUIRED", "仅运营或管理员可查看运营数据");
  }
};

const resolveSchoolId = (
  auth: { schoolId: string; role: "USER" | "OPS" | "ADMIN" },
  requestedSchoolId?: string,
) => {
  if (auth.role === "OPS" && requestedSchoolId && requestedSchoolId !== auth.schoolId) {
    throw new ApiError(403, "SCHOOL_ACCESS_DENIED", "运营只能查看本校数据");
  }
  return requestedSchoolId ?? auth.schoolId;
};

export const createOpsRoutes = (db: Database) => {
  const routes = new Hono<AppEnv>();
  routes.post("/ops/actions", async (c) => {
    const auth = c.get("auth"); requireOps(auth.role);
    if (!c.req.header("Content-Type")?.toLowerCase().startsWith("application/json")) {
      throw new ApiError(400, "JSON_CONTENT_TYPE_REQUIRED", "请求必须使用 application/json");
    }
    const input = await parseJson(c, opsActionSchema);
    const result = await runIdempotentTransaction(db, { userId: auth.userId, routeKey: "POST:/api/v1/ops/actions",
      idempotencyKey: requireIdempotencyKey(c.req.header("Idempotency-Key")), request: input },
    async (tx) => ({ data: await recordOpsAction(tx, auth, input), status: 201 }));
    c.header("Idempotency-Replayed", String(result.replayed));
    return success(c, result.data, result.status);
  });

  routes.get("/ops/flows", async (context) => {
    const auth = context.get("auth");
    requireOps(auth.role);
    const parsed = flowQuerySchema.safeParse({
      schoolId: context.req.query("schoolId"),
      sceneCode: context.req.query("sceneCode"),
      sourceChannel: context.req.query("sourceChannel"),
      status: context.req.query("status"),
      dataScope: context.req.query("dataScope"),
      from: context.req.query("from"),
      to: context.req.query("to"),
      limit: context.req.query("limit"),
      offset: context.req.query("offset"),
      cursor: context.req.query("cursor"),
      exceptionsOnly: context.req.query("exceptionsOnly"),
    });
    if (!parsed.success) {
      throw new ApiError(400, "INVALID_FLOW_FILTERS", "流程筛选条件格式错误", { issues: parsed.error.issues });
    }
    if (parsed.data.from && parsed.data.to && parsed.data.from >= parsed.data.to) {
      throw new ApiError(400, "INVALID_FLOW_RANGE", "流程结束时间必须晚于开始时间");
    }
    if (parsed.data.cursor && parsed.data.offset) throw new ApiError(400, "INVALID_FLOW_PAGINATION", "cursor 不可与非零 offset 混用");
    return success(
      context,
      await listOpsFlows(db, {
        ...parsed.data,
        schoolId: resolveSchoolId(auth, parsed.data.schoolId),
      }),
    );
  });

  routes.get("/ops/flows/:requestId", async (context) => {
    const auth = context.get("auth");
    requireOps(auth.role);
    const requestId = context.req.param("requestId");
    if (!z.string().uuid().safeParse(requestId).success) {
      throw new ApiError(400, "INVALID_REQUEST_ID", "需求编号格式错误");
    }
    const requestedSchoolId = context.req.query("schoolId");
    if (requestedSchoolId && !z.string().uuid().safeParse(requestedSchoolId).success) {
      throw new ApiError(400, "INVALID_SCHOOL_ID", "学校编号格式错误");
    }
    return success(context, await getOpsFlowDetail(db, requestId, resolveSchoolId(auth, requestedSchoolId)));
  });

  routes.get("/ops/metrics", async (context) => {
    const auth = context.get("auth");
    requireOps(auth.role);

    const parsed = metricsQuerySchema.safeParse({
      schoolId: context.req.query("schoolId"),
      sceneCode: context.req.query("sceneCode"),
      sourceChannel: context.req.query("sourceChannel"),
      from: context.req.query("from"),
      to: context.req.query("to"),
    });
    if (!parsed.success) {
      throw new ApiError(400, "INVALID_METRICS_FILTERS", "指标筛选条件格式错误", {
        issues: parsed.error.issues,
      });
    }
    if (parsed.data.from >= parsed.data.to) {
      throw new ApiError(400, "INVALID_METRICS_RANGE", "指标结束时间必须晚于开始时间");
    }
    if (parsed.data.to.getTime() - parsed.data.from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new ApiError(400, "METRICS_RANGE_TOO_LARGE", "单次指标查询最长为366天");
    }
    return success(
      context,
      await getOpsMetrics(db, {
        schoolId: resolveSchoolId(auth, parsed.data.schoolId),
        sceneCode: parsed.data.sceneCode,
        sourceChannel: parsed.data.sourceChannel,
        from: parsed.data.from,
        to: parsed.data.to,
      }),
    );
  });

  return routes;
};
