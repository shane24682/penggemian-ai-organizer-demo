import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { Database } from "../db/client.js";
import { requests } from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { executeMatching, getCurrentMatching } from "../matching/service.js";

const ensureRequestOwner = async (db: Database, requestId: string, userId: string) => {
  if (!z.string().uuid().safeParse(requestId).success) {
    throw new ApiError(400, "INVALID_REQUEST_ID", "需求编号格式错误");
  }
  const [request] = await db
    .select({ id: requests.id, creatorUserId: requests.creatorUserId })
    .from(requests)
    .where(eq(requests.id, requestId))
    .limit(1);
  if (!request || request.creatorUserId !== userId) {
    throw new ApiError(404, "REQUEST_NOT_FOUND", "需求不存在");
  }
};

export const createMatchingRoutes = (db: Database) => {
  const routes = new Hono<AppEnv>();

  routes.post("/requests/:requestId/match", async (context) => {
    const auth = context.get("auth");
    const requestId = context.req.param("requestId");
    await ensureRequestOwner(db, requestId, auth.userId);
    return success(context, await executeMatching(db, requestId));
  });

  routes.get("/requests/:requestId/matches/current", async (context) => {
    const auth = context.get("auth");
    const requestId = context.req.param("requestId");
    await ensureRequestOwner(db, requestId, auth.userId);
    return success(context, await getCurrentMatching(db, requestId));
  });

  return routes;
};
