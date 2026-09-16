import { cors } from "hono/cors";
import { Hono } from "hono";
import { requestId } from "hono/request-id";

import type { AppConfig } from "./config.js";
import type { DatabaseConnection } from "./db/client.js";
import { requireAuth } from "./http/auth-middleware.js";
import { ApiError } from "./http/errors.js";
import type { AppEnv } from "./http/types.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createInvitationRoutes } from "./routes/invitations.js";
import { createMatchingRoutes } from "./routes/matching.js";
import { createNotificationRoutes } from "./routes/notifications.js";
import { createProfileRoutes } from "./routes/profile.js";
import { createRequestRoutes } from "./routes/requests.js";

export const createApp = (config: AppConfig, connection: DatabaseConnection) => {
  const app = new Hono<AppEnv>();

  app.use("*", requestId());
  app.use(
    "/api/*",
    cors({
      origin: config.corsOrigin,
      allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    }),
  );

  app.get("/health", async (context) => {
    await connection.sql`select 1`;
    return context.json({
      data: { status: "ok", environment: config.appEnv },
      meta: { requestId: context.get("requestId") },
    });
  });

  app.route("/api/v1/auth", createAuthRoutes(config, connection.db));
  app.use("/api/v1/*", requireAuth(config, connection.db));
  app.route("/api/v1", createProfileRoutes(connection.db));
  app.route("/api/v1", createRequestRoutes(config, connection.db));
  app.route("/api/v1", createMatchingRoutes(connection.db));
  app.route("/api/v1", createInvitationRoutes(connection.db));
  app.route("/api/v1", createNotificationRoutes(connection.db));

  app.notFound((context) =>
    context.json(
      {
        error: { code: "NOT_FOUND", message: "资源不存在", details: {} },
        meta: { requestId: context.get("requestId") },
      },
      404,
    ),
  );

  app.onError((error, context) => {
    if (error instanceof ApiError) {
      return context.json(
        {
          error: { code: error.code, message: error.message, details: error.details },
          meta: { requestId: context.get("requestId") },
        },
        error.status,
      );
    }
    console.error(error);
    return context.json(
      {
        error: { code: "INTERNAL_ERROR", message: "服务暂时不可用", details: {} },
        meta: { requestId: context.get("requestId") },
      },
      500,
    );
  });

  return app;
};
