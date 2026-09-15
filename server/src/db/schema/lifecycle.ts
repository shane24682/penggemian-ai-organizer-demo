import { desc, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  checkinMethodEnum,
  checkinStatusEnum,
  dataScopeEnum,
  invitationStatusEnum,
  notificationChannelEnum,
  notificationStatusEnum,
  regroupIntentStatusEnum,
  sessionMemberStatusEnum,
  sessionMemberTypeEnum,
  sessionStatusEnum,
} from "./enums.js";
import { schools, users } from "./identity.js";
import { matchCandidates } from "./matching.js";
import { requestRoleSlots, requests } from "./requests.js";

type JsonObject = Record<string, unknown>;

/** A-owned columns that the B1 tables reference. */
export interface B1UpstreamSchema {
  schools: { id: AnyPgColumn };
  users: { id: AnyPgColumn };
  requests: { id: AnyPgColumn };
  requestRoleSlots: { id: AnyPgColumn };
  matchCandidates: { id: AnyPgColumn };
}

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull();

const timestampTz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Builds the B1 schema against Floyd's A-owned tables.
 *
 * Keeping this as a factory lets both owners work independently without B
 * redefining partial copies of `users`, `requests`, or matching tables. Floyd's
 * schema entrypoint should call this once and re-export the returned tables.
 */
export function createB1Schema(upstream: B1UpstreamSchema) {
  const sessions = pgTable(
    "sessions",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      requestId: uuid("request_id")
        .notNull()
        .references((): AnyPgColumn => upstream.requests.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      schoolId: uuid("school_id")
        .notNull()
        .references((): AnyPgColumn => upstream.schools.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      status: sessionStatusEnum("status").default("FORMING").notNull(),
      startsAt: timestampTz("starts_at").notNull(),
      endsAt: timestampTz("ends_at").notNull(),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (table) => [
      unique("sessions_request_id_unique").on(table.requestId),
      index("sessions_school_status_created_at_idx").on(
        table.schoolId,
        table.status,
        desc(table.createdAt),
      ),
      check("sessions_valid_time_range", sql`${table.endsAt} > ${table.startsAt}`),
    ],
  );

  const sessionMembers = pgTable(
    "session_members",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      sessionId: uuid("session_id")
        .notNull()
        .references(() => sessions.id, { onDelete: "restrict", onUpdate: "cascade" }),
      userId: uuid("user_id")
        .notNull()
        .references((): AnyPgColumn => upstream.users.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      // Hosts do not consume a requested role slot, so this is nullable.
      roleSlotId: uuid("role_slot_id").references(
        (): AnyPgColumn => upstream.requestRoleSlots.id,
        { onDelete: "restrict", onUpdate: "cascade" },
      ),
      memberType: sessionMemberTypeEnum("member_type").notNull(),
      memberStatus: sessionMemberStatusEnum("member_status")
        .default("CONFIRMED")
        .notNull(),
      joinedAt: timestampTz("joined_at").defaultNow().notNull(),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (table) => [
      unique("session_members_session_user_unique").on(table.sessionId, table.userId),
      index("session_members_user_status_idx").on(table.userId, table.memberStatus),
      index("session_members_session_status_idx").on(table.sessionId, table.memberStatus),
      check(
        "session_members_role_slot_by_type",
        sql`(${table.memberType} = 'HOST' AND ${table.roleSlotId} IS NULL) OR (${table.memberType} = 'PARTICIPANT' AND ${table.roleSlotId} IS NOT NULL)`,
      ),
    ],
  );

  const invitations = pgTable(
    "invitations",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      requestId: uuid("request_id")
        .notNull()
        .references((): AnyPgColumn => upstream.requests.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      sessionId: uuid("session_id")
        .notNull()
        .references(() => sessions.id, { onDelete: "restrict", onUpdate: "cascade" }),
      matchCandidateId: uuid("match_candidate_id")
        .notNull()
        .references((): AnyPgColumn => upstream.matchCandidates.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      inviteeUserId: uuid("invitee_user_id")
        .notNull()
        .references((): AnyPgColumn => upstream.users.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      roleSlotId: uuid("role_slot_id")
        .notNull()
        .references((): AnyPgColumn => upstream.requestRoleSlots.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      status: invitationStatusEnum("status").notNull(),
      queuePosition: integer("queue_position").notNull(),
      sentAt: timestampTz("sent_at"),
      expiresAt: timestampTz("expires_at"),
      respondedAt: timestampTz("responded_at"),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (table) => [
      unique("invitations_match_candidate_unique").on(table.matchCandidateId),
      uniqueIndex("invitations_active_request_user_slot_unique")
        .on(table.requestId, table.inviteeUserId, table.roleSlotId)
        .where(sql`${table.status} IN ('QUEUED', 'PENDING')`),
      index("invitations_invitee_status_created_at_idx").on(
        table.inviteeUserId,
        table.status,
        desc(table.createdAt),
      ),
      index("invitations_status_expires_at_idx").on(table.status, table.expiresAt),
      index("invitations_session_role_status_idx").on(
        table.sessionId,
        table.roleSlotId,
        table.status,
      ),
      check("invitations_queue_position_nonnegative", sql`${table.queuePosition} >= 0`),
      check(
        "invitations_valid_expiry",
        sql`(${table.sentAt} IS NULL AND ${table.expiresAt} IS NULL) OR (${table.sentAt} IS NOT NULL AND ${table.expiresAt} > ${table.sentAt})`,
      ),
      check(
        "invitations_valid_response_time",
        sql`${table.respondedAt} IS NULL OR (${table.sentAt} IS NOT NULL AND ${table.respondedAt} >= ${table.sentAt})`,
      ),
    ],
  );

  const statusEvents = pgTable(
    "status_events",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
      aggregateId: uuid("aggregate_id").notNull(),
      eventType: varchar("event_type", { length: 96 }).notNull(),
      actorUserId: uuid("actor_user_id").references(
        (): AnyPgColumn => upstream.users.id,
        { onDelete: "restrict", onUpdate: "cascade" },
      ),
      fromStatus: varchar("from_status", { length: 32 }),
      toStatus: varchar("to_status", { length: 32 }).notNull(),
      payloadJson: jsonb("payload_json").$type<JsonObject>().default({}).notNull(),
      idempotencyKey: varchar("idempotency_key", { length: 128 }),
      createdAt: createdAt(),
    },
    (table) => [
      index("status_events_aggregate_created_at_idx").on(
        table.aggregateType,
        table.aggregateId,
        table.createdAt,
      ),
      uniqueIndex("status_events_aggregate_idempotency_unique")
        .on(table.aggregateType, table.aggregateId, table.idempotencyKey)
        .where(sql`${table.idempotencyKey} IS NOT NULL`),
      check(
        "status_events_status_changed",
        sql`${table.fromStatus} IS NULL OR ${table.fromStatus} <> ${table.toStatus}`,
      ),
    ],
  );

  const checkins = pgTable(
    "checkins",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      sessionId: uuid("session_id")
        .notNull()
        .references(() => sessions.id, { onDelete: "restrict", onUpdate: "cascade" }),
      userId: uuid("user_id")
        .notNull()
        .references((): AnyPgColumn => upstream.users.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      status: checkinStatusEnum("status").notNull(),
      method: checkinMethodEnum("method").default("SELF_CONFIRM").notNull(),
      checkedInAt: timestampTz("checked_in_at"),
      createdAt: createdAt(),
    },
    (table) => [
      unique("checkins_session_user_unique").on(table.sessionId, table.userId),
      index("checkins_session_status_idx").on(table.sessionId, table.status),
      check(
        "checkins_timestamp_by_status",
        sql`(${table.status} = 'ABSENT' AND ${table.checkedInAt} IS NULL) OR (${table.status} IN ('PRESENT', 'LATE') AND ${table.checkedInAt} IS NOT NULL)`,
      ),
    ],
  );

  const reviews = pgTable(
    "reviews",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      sessionId: uuid("session_id")
        .notNull()
        .references(() => sessions.id, { onDelete: "restrict", onUpdate: "cascade" }),
      reviewerUserId: uuid("reviewer_user_id")
        .notNull()
        .references((): AnyPgColumn => upstream.users.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      revieweeUserId: uuid("reviewee_user_id")
        .notNull()
        .references((): AnyPgColumn => upstream.users.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      rating: smallint("rating").notNull(),
      tagsJson: jsonb("tags_json").$type<string[]>().default([]).notNull(),
      comment: varchar("comment", { length: 1000 }),
      createdAt: createdAt(),
    },
    (table) => [
      unique("reviews_session_reviewer_reviewee_unique").on(
        table.sessionId,
        table.reviewerUserId,
        table.revieweeUserId,
      ),
      index("reviews_session_created_at_idx").on(table.sessionId, table.createdAt),
      check("reviews_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
      check("reviews_no_self_review", sql`${table.reviewerUserId} <> ${table.revieweeUserId}`),
      check("reviews_tags_is_array", sql`jsonb_typeof(${table.tagsJson}) = 'array'`),
    ],
  );

  const regroupIntents = pgTable(
    "regroup_intents",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      sessionId: uuid("session_id")
        .notNull()
        .references(() => sessions.id, { onDelete: "restrict", onUpdate: "cascade" }),
      userId: uuid("user_id")
        .notNull()
        .references((): AnyPgColumn => upstream.users.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      willingUserIdsJson: jsonb("willing_user_ids_json")
        .$type<string[]>()
        .default([])
        .notNull(),
      status: regroupIntentStatusEnum("status").default("OPEN").notNull(),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (table) => [
      unique("regroup_intents_session_user_unique").on(table.sessionId, table.userId),
      index("regroup_intents_session_status_idx").on(table.sessionId, table.status),
      check(
        "regroup_intents_willing_users_is_array",
        sql`jsonb_typeof(${table.willingUserIdsJson}) = 'array'`,
      ),
    ],
  );

  const notificationOutbox = pgTable(
    "notification_outbox",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      recipientUserId: uuid("recipient_user_id")
        .notNull()
        .references((): AnyPgColumn => upstream.users.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      channel: notificationChannelEnum("channel").default("IN_APP").notNull(),
      templateCode: varchar("template_code", { length: 96 }).notNull(),
      aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
      aggregateId: uuid("aggregate_id").notNull(),
      payloadJson: jsonb("payload_json").$type<JsonObject>().default({}).notNull(),
      status: notificationStatusEnum("status").default("QUEUED").notNull(),
      attemptCount: smallint("attempt_count").default(0).notNull(),
      availableAt: timestampTz("available_at").defaultNow().notNull(),
      sentAt: timestampTz("sent_at"),
      readAt: timestampTz("read_at"),
      idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
      lastError: text("last_error"),
      createdAt: createdAt(),
      updatedAt: updatedAt(),
    },
    (table) => [
      unique("notification_outbox_idempotency_key_unique").on(table.idempotencyKey),
      index("notification_outbox_status_available_at_idx").on(
        table.status,
        table.availableAt,
      ),
      index("notification_outbox_recipient_created_at_idx").on(
        table.recipientUserId,
        desc(table.createdAt),
      ),
      check(
        "notification_outbox_attempt_count_range",
        sql`${table.attemptCount} BETWEEN 0 AND 3`,
      ),
      check(
        "notification_outbox_read_after_sent",
        sql`${table.readAt} IS NULL OR (${table.sentAt} IS NOT NULL AND ${table.readAt} >= ${table.sentAt})`,
      ),
    ],
  );

  const domainEvents = pgTable(
    "domain_events",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references((): AnyPgColumn => upstream.schools.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      actorUserId: uuid("actor_user_id").references(
        (): AnyPgColumn => upstream.users.id,
        { onDelete: "restrict", onUpdate: "cascade" },
      ),
      eventType: varchar("event_type", { length: 96 }).notNull(),
      aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
      aggregateId: uuid("aggregate_id").notNull(),
      requestId: uuid("request_id").references(
        (): AnyPgColumn => upstream.requests.id,
        { onDelete: "restrict", onUpdate: "cascade" },
      ),
      sessionId: uuid("session_id").references(() => sessions.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
      dataScope: dataScopeEnum("data_scope").notNull(),
      payloadJson: jsonb("payload_json").$type<JsonObject>().default({}).notNull(),
      dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
      occurredAt: timestampTz("occurred_at").defaultNow().notNull(),
      createdAt: createdAt(),
    },
    (table) => [
      unique("domain_events_dedupe_key_unique").on(table.dedupeKey),
      index("domain_events_school_event_occurred_at_idx").on(
        table.schoolId,
        table.eventType,
        table.occurredAt,
      ),
      index("domain_events_request_occurred_at_idx").on(table.requestId, table.occurredAt),
      index("domain_events_session_occurred_at_idx").on(table.sessionId, table.occurredAt),
    ],
  );

  const opsWorkLogs = pgTable(
    "ops_work_logs",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      opsUserId: uuid("ops_user_id")
        .notNull()
        .references((): AnyPgColumn => upstream.users.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      requestId: uuid("request_id").references(
        (): AnyPgColumn => upstream.requests.id,
        { onDelete: "restrict", onUpdate: "cascade" },
      ),
      sessionId: uuid("session_id").references(() => sessions.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
      actionType: varchar("action_type", { length: 96 }).notNull(),
      minutesSpent: integer("minutes_spent").notNull(),
      note: varchar("note", { length: 1000 }),
      createdAt: createdAt(),
    },
    (table) => [
      index("ops_work_logs_request_created_at_idx").on(table.requestId, table.createdAt),
      index("ops_work_logs_session_created_at_idx").on(table.sessionId, table.createdAt),
      check("ops_work_logs_minutes_positive", sql`${table.minutesSpent} > 0`),
      check(
        "ops_work_logs_has_aggregate",
        sql`${table.requestId} IS NOT NULL OR ${table.sessionId} IS NOT NULL`,
      ),
    ],
  );

  const costItems = pgTable(
    "cost_items",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references((): AnyPgColumn => upstream.schools.id, {
          onDelete: "restrict",
          onUpdate: "cascade",
        }),
      requestId: uuid("request_id").references(
        (): AnyPgColumn => upstream.requests.id,
        { onDelete: "restrict", onUpdate: "cascade" },
      ),
      sessionId: uuid("session_id").references(() => sessions.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
      costType: varchar("cost_type", { length: 96 }).notNull(),
      amountCents: integer("amount_cents").notNull(),
      currency: varchar("currency", { length: 3 }).default("CNY").notNull(),
      note: varchar("note", { length: 1000 }),
      incurredAt: timestampTz("incurred_at").notNull(),
      createdAt: createdAt(),
    },
    (table) => [
      index("cost_items_school_incurred_at_idx").on(table.schoolId, table.incurredAt),
      index("cost_items_request_incurred_at_idx").on(table.requestId, table.incurredAt),
      index("cost_items_session_incurred_at_idx").on(table.sessionId, table.incurredAt),
      check("cost_items_amount_nonnegative", sql`${table.amountCents} >= 0`),
      check("cost_items_currency_cny", sql`${table.currency} = 'CNY'`),
      check(
        "cost_items_has_aggregate",
        sql`${table.requestId} IS NOT NULL OR ${table.sessionId} IS NOT NULL`,
      ),
    ],
  );

  return {
    sessions,
    sessionMembers,
    invitations,
    statusEvents,
    checkins,
    reviews,
    regroupIntents,
    notificationOutbox,
    domainEvents,
    opsWorkLogs,
    costItems,
  };
}

export type B1Schema = ReturnType<typeof createB1Schema>;

export const {
  sessions,
  sessionMembers,
  invitations,
  statusEvents,
  checkins,
  reviews,
  regroupIntents,
  notificationOutbox,
  domainEvents,
  opsWorkLogs,
  costItems,
} = createB1Schema({
  schools,
  users,
  requests,
  requestRoleSlots,
  matchCandidates,
});
