import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { capabilityRoleEnum, schoolStatusEnum, userRoleEnum, userStatusEnum, verificationStatusEnum } from "./enums.js";

export const schools = pgTable(
  "schools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    status: schoolStatusEnum("status").default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("schools_code_unique").on(table.code), uniqueIndex("schools_name_unique").on(table.name)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    phoneE164: varchar("phone_e164", { length: 32 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").default("USER").notNull(),
    status: userStatusEnum("status").default("ACTIVE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_phone_e164_unique").on(table.phoneE164),
    index("users_school_status_idx").on(table.schoolId, table.status),
  ],
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 64 }).notNull(),
    avatarUrl: text("avatar_url"),
    majorCategory: varchar("major_category", { length: 64 }).notNull(),
    gradeYear: smallint("grade_year").notNull(),
    bio: varchar("bio", { length: 500 }),
    competitionTags: jsonb("competition_tags").$type<string[]>().default([]).notNull(),
    weeklyHours: smallint("weekly_hours").default(0).notNull(),
    trustScore: smallint("trust_score").default(80).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("user_profiles_grade_year_check", sql`${table.gradeYear} between 1 and 8`),
    check("user_profiles_weekly_hours_check", sql`${table.weeklyHours} between 0 and 80`),
    check("user_profiles_trust_score_check", sql`${table.trustScore} between 0 and 100`),
  ],
);

export const userAvailability = pgTable(
  "user_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("user_availability_time_check", sql`${table.endsAt} > ${table.startsAt}`),
    index("user_availability_time_idx").on(table.startsAt, table.endsAt),
    index("user_availability_user_idx").on(table.userId),
  ],
);

export const userCapabilities = pgTable(
  "user_capabilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleCode: capabilityRoleEnum("role_code").notNull(),
    level: smallint("level").notNull(),
    summary: varchar("summary", { length: 300 }),
    verificationStatus: verificationStatusEnum("verification_status").default("UNVERIFIED").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("user_capabilities_level_check", sql`${table.level} between 1 and 5`),
    uniqueIndex("user_capabilities_user_role_unique").on(table.userId, table.roleCode),
    index("user_capabilities_lookup_idx").on(table.roleCode, table.level, table.verificationStatus),
  ],
);

export const verificationRecords = pgTable(
  "verification_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    capabilityId: uuid("capability_id").references(() => userCapabilities.id, { onDelete: "cascade" }),
    verificationType: varchar("verification_type", { length: 64 }).notNull(),
    evidenceUrl: text("evidence_url").notNull(),
    status: verificationStatusEnum("status").default("PENDING").notNull(),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("verification_records_user_status_idx").on(table.userId, table.status)],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    routeKey: varchar("route_key", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 128 }).notNull(),
    responseStatus: integer("response_status"),
    responseJson: jsonb("response_json"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idempotency_records_key_unique").on(table.userId, table.routeKey, table.idempotencyKey)],
);
