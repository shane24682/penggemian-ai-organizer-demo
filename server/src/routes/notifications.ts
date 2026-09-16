import { Hono } from "hono";
import { z } from "zod";

import type { Database } from "../db/client.js";
import { ApiError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { listMyNotifications, markNotificationRead } from "../notifications/service.js";

export const createNotificationRoutes = (db: Database) => {
  const routes = new Hono<AppEnv>();

  routes.get("/me/notifications", async (context) =>
    success(context, await listMyNotifications(db, context.get("auth").userId)),
  );

  routes.post("/me/notifications/:notificationId/read", async (context) => {
    const notificationId = context.req.param("notificationId");
    if (!z.string().uuid().safeParse(notificationId).success) {
      throw new ApiError(400, "INVALID_NOTIFICATION_ID", "通知编号格式错误");
    }
    return success(context, await markNotificationRead(db, notificationId, context.get("auth").userId));
  });

  return routes;
};
