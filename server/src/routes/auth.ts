import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { createAccessToken } from "../auth/jwt.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { schools, userProfiles, users } from "../db/schema/index.js";
import { ApiError, isPostgresError } from "../http/errors.js";
import { success } from "../http/responses.js";
import type { AppEnv } from "../http/types.js";
import { parseJson } from "../http/validation.js";

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "手机号必须使用E.164格式");

const registerSchema = z.object({
  phoneE164: phoneSchema,
  password: z.string().min(8).max(128),
  schoolCode: z.string().min(1).max(64),
  displayName: z.string().min(1).max(64),
  majorCategory: z.string().min(1).max(64),
  gradeYear: z.number().int().min(1).max(8),
});

const loginSchema = z.object({
  phoneE164: phoneSchema,
  password: z.string().min(1).max(128),
});

export const createAuthRoutes = (config: AppConfig, db: Database) => {
  const routes = new Hono<AppEnv>();

  routes.post("/register", async (context) => {
    const input = await parseJson(context, registerSchema);
    const [school] = await db
      .select({ id: schools.id })
      .from(schools)
      .where(and(eq(schools.code, input.schoolCode), eq(schools.status, "ACTIVE")))
      .limit(1);
    if (!school) throw new ApiError(422, "SCHOOL_NOT_AVAILABLE", "学校不存在或暂未开放");

    try {
      const passwordHash = await hashPassword(input.password);
      const created = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ schoolId: school.id, phoneE164: input.phoneE164, passwordHash })
          .returning({ id: users.id, schoolId: users.schoolId, role: users.role });
        await tx.insert(userProfiles).values({
          userId: user.id,
          displayName: input.displayName,
          majorCategory: input.majorCategory,
          gradeYear: input.gradeYear,
        });
        return user;
      });
      const token = await createAccessToken(
        { userId: created.id, schoolId: created.schoolId, role: created.role },
        config.jwtSecret,
      );
      return success(
        context,
        {
          accessToken: token,
          user: { id: created.id, schoolId: created.schoolId, role: created.role, displayName: input.displayName },
        },
        201,
      );
    } catch (error) {
      if (isPostgresError(error, "23505")) {
        throw new ApiError(409, "PHONE_ALREADY_REGISTERED", "该手机号已经注册");
      }
      throw error;
    }
  });

  routes.post("/login", async (context) => {
    const input = await parseJson(context, loginSchema);
    const [row] = await db
      .select({
        id: users.id,
        schoolId: users.schoolId,
        role: users.role,
        status: users.status,
        passwordHash: users.passwordHash,
        displayName: userProfiles.displayName,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.phoneE164, input.phoneE164))
      .limit(1);

    if (!row || row.status !== "ACTIVE" || !(await verifyPassword(input.password, row.passwordHash))) {
      throw new ApiError(401, "LOGIN_FAILED", "手机号或密码错误");
    }

    const token = await createAccessToken(
      { userId: row.id, schoolId: row.schoolId, role: row.role },
      config.jwtSecret,
    );
    return success(context, {
      accessToken: token,
      user: { id: row.id, schoolId: row.schoolId, role: row.role, displayName: row.displayName },
    });
  });

  return routes;
};
