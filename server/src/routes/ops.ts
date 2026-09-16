import { Hono } from "hono";
import { z } from "zod";

import type { Database } from "../db/client.js";
import { ApiError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { getOpsMetrics } from "../ops/metrics.js";

const metricsQuerySchema = z.object({
  schoolId: z.string().uuid().optional(),
  sceneCode: z.enum(["MATH_MODELING"]).default("MATH_MODELING"),
  sourceChannel: z.string().min(1).max(64).optional(),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const createOpsRoutes = (db: Database) => {
  const routes = new Hono<AppEnv>();

  routes.get("/ops/metrics", async (context) => {
    const auth = context.get("auth");
    if (auth.role === "USER") {
      throw new ApiError(403, "OPS_ACCESS_REQUIRED", "仅运营或管理员可查看指标");
    }

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
    if (auth.role === "OPS" && parsed.data.schoolId && parsed.data.schoolId !== auth.schoolId) {
      throw new ApiError(403, "SCHOOL_ACCESS_DENIED", "运营只能查看本校指标");
    }

    return success(
      context,
      await getOpsMetrics(db, {
        schoolId: parsed.data.schoolId ?? auth.schoolId,
        sceneCode: parsed.data.sceneCode,
        sourceChannel: parsed.data.sourceChannel,
        from: parsed.data.from,
        to: parsed.data.to,
      }),
    );
  });

  return routes;
};
