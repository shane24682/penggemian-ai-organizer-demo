import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { getTableConfig } from "drizzle-orm/pg-core";

import {
  invitationStatusEnum,
  notificationStatusEnum,
  sessionMemberStatusEnum,
  sessionStatusEnum,
} from "../server/src/db/schema/enums.js";
import { createB1SeedRows } from "../server/test/fixtures/b1-fixtures.js";
import {
  checkins,
  costItems,
  domainEvents,
  invitations,
  notificationOutbox,
  opsWorkLogs,
  regroupIntents,
  reviews,
  sessionMembers,
  sessions,
  statusEvents,
} from "../server/src/db/schema/lifecycle.js";

const schema = {
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

const names = (items) =>
  items
    .map((item) => item.getName?.() ?? item.name ?? item.config?.name)
    .sort();

test("B1 exposes exactly the eleven assigned tables", () => {
  assert.deepEqual(
    Object.values(schema).map((table) => getTableConfig(table).name).sort(),
    [
      "checkins",
      "cost_items",
      "domain_events",
      "invitations",
      "notification_outbox",
      "ops_work_logs",
      "regroup_intents",
      "reviews",
      "session_members",
      "sessions",
      "status_events",
    ],
  );
});

test("all B1 tables use UUID primary keys and created_at", () => {
  for (const table of Object.values(schema)) {
    const config = getTableConfig(table);
    assert.equal(config.columns.find((column) => column.name === "id")?.columnType, "PgUUID");
    assert.equal(config.columns.find((column) => column.name === "id")?.primary, true);
    assert.ok(config.columns.some((column) => column.name === "created_at"), config.name);
  }
});

test("contract unique constraints prevent duplicate lifecycle records", () => {
  assert.ok(names(getTableConfig(schema.sessions).uniqueConstraints).includes("sessions_request_id_unique"));
  assert.ok(names(getTableConfig(schema.sessionMembers).uniqueConstraints).includes("session_members_session_user_unique"));
  assert.ok(names(getTableConfig(schema.checkins).uniqueConstraints).includes("checkins_session_user_unique"));
  assert.ok(names(getTableConfig(schema.reviews).uniqueConstraints).includes("reviews_session_reviewer_reviewee_unique"));
  assert.ok(names(getTableConfig(schema.regroupIntents).uniqueConstraints).includes("regroup_intents_session_user_unique"));
  assert.ok(names(getTableConfig(schema.notificationOutbox).uniqueConstraints).includes("notification_outbox_idempotency_key_unique"));
  assert.ok(names(getTableConfig(schema.domainEvents).uniqueConstraints).includes("domain_events_dedupe_key_unique"));
  assert.ok(names(getTableConfig(schema.invitations).indexes).includes("invitations_active_request_user_slot_unique"));
});

test("contract state enums are frozen exactly", () => {
  assert.deepEqual(sessionStatusEnum.enumValues, [
    "FORMING",
    "CONFIRMED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ]);
  assert.deepEqual(sessionMemberStatusEnum.enumValues, [
    "CONFIRMED",
    "WITHDRAWN",
    "COMPLETED",
    "NO_SHOW",
  ]);
  assert.deepEqual(invitationStatusEnum.enumValues, [
    "QUEUED",
    "PENDING",
    "ACCEPTED",
    "DECLINED",
    "EXPIRED",
    "CANCELLED",
  ]);
  assert.deepEqual(notificationStatusEnum.enumValues, [
    "QUEUED",
    "PROCESSING",
    "SENT",
    "FAILED",
    "DEAD",
  ]);
});

test("required operational indexes are present", () => {
  assert.ok(names(getTableConfig(schema.invitations).indexes).includes("invitations_invitee_status_created_at_idx"));
  assert.ok(names(getTableConfig(schema.invitations).indexes).includes("invitations_status_expires_at_idx"));
  assert.ok(names(getTableConfig(schema.sessionMembers).indexes).includes("session_members_user_status_idx"));
  assert.ok(names(getTableConfig(schema.notificationOutbox).indexes).includes("notification_outbox_status_available_at_idx"));
  assert.ok(names(getTableConfig(schema.domainEvents).indexes).includes("domain_events_school_event_occurred_at_idx"));
});

test("every relational B1 table has foreign keys with restrictive deletes", () => {
  const relationalTables = [
    schema.sessions,
    schema.sessionMembers,
    schema.invitations,
    schema.checkins,
    schema.reviews,
    schema.regroupIntents,
    schema.notificationOutbox,
    schema.domainEvents,
    schema.opsWorkLogs,
    schema.costItems,
  ];

  for (const table of relationalTables) {
    const config = getTableConfig(table);
    assert.ok(config.foreignKeys.length > 0, config.name);
    for (const foreignKey of config.foreignKeys) {
      assert.equal(foreignKey.onDelete, "restrict", `${config.name}:${foreignKey.getName()}`);
    }
  }
});

test("database checks cover invalid status-adjacent data", () => {
  assert.ok(names(getTableConfig(schema.sessions).checks).includes("sessions_valid_time_range"));
  assert.ok(names(getTableConfig(schema.sessionMembers).checks).includes("session_members_role_slot_by_type"));
  assert.ok(names(getTableConfig(schema.invitations).checks).includes("invitations_valid_expiry"));
  assert.ok(names(getTableConfig(schema.checkins).checks).includes("checkins_timestamp_by_status"));
  assert.ok(names(getTableConfig(schema.reviews).checks).includes("reviews_rating_range"));
  assert.ok(names(getTableConfig(schema.notificationOutbox).checks).includes("notification_outbox_attempt_count_range"));
  assert.ok(names(getTableConfig(schema.costItems).checks).includes("cost_items_currency_cny"));
});

test("Drizzle Kit can export complete PostgreSQL DDL without writing a migration", () => {
  const drizzleKit = new URL("../node_modules/drizzle-kit/bin.cjs", import.meta.url);
  const ddl = execFileSync(
    process.execPath,
    [
      fileURLToPath(drizzleKit),
      "export",
      "--dialect",
      "postgresql",
      "--schema",
      "server/src/db/schema/index.ts",
    ],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" },
  );

  assert.match(ddl, /CREATE TYPE "public"\."session_status" AS ENUM/);
  assert.match(ddl, /CREATE TABLE "sessions"/);
  assert.match(ddl, /CREATE TABLE "cost_items"/);
  assert.match(ddl, /ON DELETE restrict/);
  assert.match(ddl, /CREATE UNIQUE INDEX "invitations_active_request_user_slot_unique"/);
});

test("unified migration history contains every B1 table and enum", () => {
  const journal = JSON.parse(
    readFileSync(resolve("server/drizzle/meta/_journal.json"), "utf8"),
  );
  const b1Tag = journal.entries.find(({ tag }) => tag === "0001_overconfident_satana")?.tag;
  assert.equal(b1Tag, "0001_overconfident_satana");

  const migration = readFileSync(resolve(`server/drizzle/${b1Tag}.sql`), "utf8");
  for (const tableName of [
    "sessions",
    "session_members",
    "invitations",
    "status_events",
    "checkins",
    "reviews",
    "regroup_intents",
    "notification_outbox",
    "domain_events",
    "ops_work_logs",
    "cost_items",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${tableName}"`), tableName);
  }
  for (const enumName of [
    "session_status",
    "session_member_type",
    "session_member_status",
    "invitation_status",
    "checkin_status",
    "checkin_method",
    "regroup_intent_status",
    "notification_channel",
    "notification_status",
  ]) {
    assert.match(migration, new RegExp(`CREATE TYPE "public"\\."${enumName}"`), enumName);
  }
  assert.match(migration, /REFERENCES "public"\."requests"/);
  assert.match(migration, /REFERENCES "public"\."match_candidates"/);
});

test("B1 TEST fixtures cover the complete assigned lifecycle", () => {
  const refs = {
    schoolId: "a0000000-0000-4000-8000-000000000001",
    requestId: "a0000000-0000-4000-8000-000000000002",
    codingRoleSlotId: "a0000000-0000-4000-8000-000000000003",
    writingRoleSlotId: "a0000000-0000-4000-8000-000000000004",
    candidateBId: "a0000000-0000-4000-8000-000000000005",
    candidateCId: "a0000000-0000-4000-8000-000000000006",
    candidateDId: "a0000000-0000-4000-8000-000000000007",
    userAId: "a0000000-0000-4000-8000-000000000008",
    userBId: "a0000000-0000-4000-8000-000000000009",
    userCId: "a0000000-0000-4000-8000-00000000000a",
    userDId: "a0000000-0000-4000-8000-00000000000b",
    opsUserId: "a0000000-0000-4000-8000-00000000000c",
  };
  const rows = createB1SeedRows(refs);

  assert.deepEqual(Object.keys(rows).sort(), Object.keys(schema).sort());
  assert.deepEqual(rows.invitations.map(({ status }) => status), [
    "DECLINED",
    "ACCEPTED",
    "ACCEPTED",
  ]);
  assert.equal(rows.invitations[2].queuePosition, 1);
  assert.equal(rows.sessionMembers.length, 3);
  assert.equal(rows.checkins.length, 3);
  assert.equal(rows.reviews.length, 1);
  assert.equal(rows.regroupIntents.length, 2);
  assert.equal(rows.notificationOutbox[0].templateCode, "BACKUP_PROMOTED");
  assert.equal(rows.domainEvents[0].dataScope, "TEST");
  assert.equal(rows.opsWorkLogs[0].minutesSpent, 5);
  assert.equal(rows.costItems[0].currency, "CNY");
});

test("production bootstrap opens CUC without creating seed users", () => {
  const journal = JSON.parse(readFileSync(resolve("server/drizzle/meta/_journal.json"), "utf8"));
  const migrationTag = journal.entries.find(({ tag }) => /^0003_/.test(tag))?.tag;
  assert.ok(migrationTag);
  const migration = readFileSync(resolve(`server/drizzle/${migrationTag}.sql`), "utf8");
  assert.match(migration, /'CUC'/);
  assert.match(migration, /'中国传媒大学'/);
  assert.doesNotMatch(migration, /INSERT INTO "users"/);
});
