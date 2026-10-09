import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";

import type { Database } from "../db/client.js";
import { schools } from "../db/schema/index.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";

export const createSchoolRoutes = (db: Database) => {
  const routes = new Hono<AppEnv>();

  routes.get("/schools", async (context) => {
    const rows = await db
      .select({ code: schools.code, name: schools.name })
      .from(schools)
      .where(eq(schools.status, "ACTIVE"))
      .orderBy(asc(schools.name));
    return success(context, rows);
  });

  return routes;
};
