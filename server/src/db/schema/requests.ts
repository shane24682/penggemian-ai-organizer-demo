import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, smallint, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { capabilityRoleEnum, dataScopeEnum, requestSceneEnum, requestStatusEnum } from "./enums.js";
import { schools, users } from "./identity.js";

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    creatorUserId: uuid("creator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sceneCode: requestSceneEnum("scene_code").default("MATH_MODELING").notNull(),
    competitionName: varchar("competition_name", { length: 128 }).notNull(),
    title: varchar("title", { length: 100 }).notNull(),
    description: varchar("description", { length: 1000 }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    weeklyHoursRequired: smallint("weekly_hours_required").default(0).notNull(),
    participantLimit: smallint("participant_limit").default(3).notNull(),
    applicationDeadline: timestamp("application_deadline", { withTimezone: true }).notNull(),
    status: requestStatusEnum("status").default("OPEN").notNull(),
    sourceChannel: varchar("source_channel", { length: 64 }).default("DIRECT").notNull(),
    sourceSessionId: uuid("source_session_id"),
    dataScope: dataScopeEnum("data_scope").default("REAL").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    check("requests_time_check", sql`${table.endsAt} > ${table.startsAt}`),
    check("requests_deadline_check", sql`${table.applicationDeadline} <= ${table.startsAt}`),
    check("requests_weekly_hours_check", sql`${table.weeklyHoursRequired} between 0 and 80`),
    check("requests_participant_limit_check", sql`${table.participantLimit} between 2 and 3`),
    index("requests_school_status_created_idx").on(table.schoolId, table.status, table.createdAt),
    index("requests_creator_created_idx").on(table.creatorUserId, table.createdAt),
  ],
);

export const requestRoleSlots = pgTable(
  "request_role_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    roleCode: capabilityRoleEnum("role_code").notNull(),
    slotCount: smallint("slot_count").notNull(),
    minLevel: smallint("min_level").notNull(),
    evidenceRequired: boolean("evidence_required").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("request_role_slots_count_check", sql`${table.slotCount} between 1 and 2`),
    check("request_role_slots_level_check", sql`${table.minLevel} between 1 and 5`),
    uniqueIndex("request_role_slots_request_role_unique").on(table.requestId, table.roleCode),
  ],
);
