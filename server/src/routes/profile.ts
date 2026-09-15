import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { Database } from "../db/client.js";
import { userAvailability, userCapabilities, userProfiles, users } from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { parseJson } from "../http/validation.js";

const profileSchema = z.object({
  displayName: z.string().min(1).max(64),
  avatarUrl: z.string().url().nullable().optional(),
  majorCategory: z.string().min(1).max(64),
  gradeYear: z.number().int().min(1).max(8),
  bio: z.string().max(500).nullable().optional(),
  competitionTags: z.array(z.string().min(1).max(64)).max(20),
  weeklyHours: z.number().int().min(0).max(80),
});

const availabilitySchema = z.object({
  windows: z
    .array(z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date() }))
    .max(20)
    .refine((windows) => windows.every((window) => window.endsAt > window.startsAt), "可用时间结束时间必须晚于开始时间"),
});

const capabilitiesSchema = z.object({
  capabilities: z
    .array(
      z.object({
        roleCode: z.enum(["MODELING", "CODING", "WRITING", "OPEN"]),
        level: z.number().int().min(1).max(5),
        summary: z.string().max(300).nullable().optional(),
      }),
    )
    .max(4)
    .refine((items) => new Set(items.map((item) => item.roleCode)).size === items.length, "角色能力不能重复"),
});

export const createProfileRoutes = (db: Database) => {
  const routes = new Hono<AppEnv>();

  routes.get("/me", async (context) => {
    const auth = context.get("auth");
    const [row] = await db
      .select({
        id: users.id,
        schoolId: users.schoolId,
        role: users.role,
        displayName: userProfiles.displayName,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, auth.userId))
      .limit(1);
    return success(context, row);
  });

  routes.get("/me/profile", async (context) => {
    const auth = context.get("auth");
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, auth.userId)).limit(1);
    if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND", "用户资料不存在");

    const availability = await db
      .select()
      .from(userAvailability)
      .where(eq(userAvailability.userId, auth.userId))
      .orderBy(asc(userAvailability.startsAt));
    const capabilities = await db
      .select()
      .from(userCapabilities)
      .where(eq(userCapabilities.userId, auth.userId))
      .orderBy(asc(userCapabilities.roleCode));

    return success(context, { ...profile, availability, capabilities });
  });

  routes.put("/me/profile", async (context) => {
    const auth = context.get("auth");
    const input = await parseJson(context, profileSchema);
    const [profile] = await db
      .update(userProfiles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(userProfiles.userId, auth.userId))
      .returning();
    if (!profile) throw new ApiError(404, "PROFILE_NOT_FOUND", "用户资料不存在");
    return success(context, profile);
  });

  routes.put("/me/availability", async (context) => {
    const auth = context.get("auth");
    const input = await parseJson(context, availabilitySchema);
    const rows = await db.transaction(async (tx) => {
      await tx.delete(userAvailability).where(eq(userAvailability.userId, auth.userId));
      if (!input.windows.length) return [];
      return tx
        .insert(userAvailability)
        .values(input.windows.map((window) => ({ userId: auth.userId, ...window })))
        .returning();
    });
    return success(context, rows);
  });

  routes.put("/me/capabilities", async (context) => {
    const auth = context.get("auth");
    const input = await parseJson(context, capabilitiesSchema);
    const rows = await db.transaction(async (tx) => {
      await tx.delete(userCapabilities).where(eq(userCapabilities.userId, auth.userId));
      if (!input.capabilities.length) return [];
      return tx
        .insert(userCapabilities)
        .values(input.capabilities.map((capability) => ({ userId: auth.userId, ...capability })))
        .returning();
    });
    return success(context, rows);
  });

  return routes;
};
