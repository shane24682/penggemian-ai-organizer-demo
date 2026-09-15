import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { verifyAccessToken } from "../auth/jwt.js";
import { ApiError } from "./errors.js";
import type { AppEnv } from "./types.js";

export const requireAuth = (config: AppConfig, db: Database): MiddlewareHandler<AppEnv> => async (context, next) => {
  const authorization = context.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "AUTH_REQUIRED", "请先登录");
  }

  try {
    const auth = await verifyAccessToken(authorization.slice(7), config.jwtSecret);
    const [activeUser] = await db
      .select({ id: users.id, schoolId: users.schoolId, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!activeUser || activeUser.status !== "ACTIVE") {
      throw new ApiError(401, "AUTH_INVALID", "登录状态已失效");
    }

    context.set("auth", {
      userId: activeUser.id,
      schoolId: activeUser.schoolId,
      role: activeUser.role,
    });
    await next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "AUTH_INVALID", "登录状态已失效");
  }
};
