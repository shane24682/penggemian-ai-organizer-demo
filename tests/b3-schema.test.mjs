import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import { deliveryAttempts } from "../server/src/db/schema/notifications.js";

const names = (items) => items.map((item) => item.getName?.() ?? item.name ?? item.config?.name);

test("delivery attempts enforce retry identity, range and history protection", () => {
  const config = getTableConfig(deliveryAttempts);
  assert.equal(config.name, "delivery_attempts");
  assert.ok(names(config.uniqueConstraints).includes("delivery_attempts_outbox_attempt_unique"));
  assert.ok(names(config.checks).includes("delivery_attempts_attempt_no_range"));
  assert.ok(names(config.indexes).includes("delivery_attempts_outbox_started_at_idx"));
  assert.equal(config.foreignKeys[0].onDelete, "restrict");
});

test("B3 migration creates delivery attempt enum and table", () => {
  const journal = JSON.parse(readFileSync(resolve("server/drizzle/meta/_journal.json"), "utf8"));
  const migrationTag = journal.entries.find(({ tag }) => /^0002_/.test(tag))?.tag;
  assert.ok(migrationTag);
  const migration = readFileSync(resolve(`server/drizzle/${migrationTag}.sql`), "utf8");
  assert.match(migration, /CREATE TYPE "public"\."delivery_attempt_status" AS ENUM/);
  assert.match(migration, /CREATE TABLE "delivery_attempts"/);
  assert.match(migration, /delivery_attempts_outbox_attempt_unique/);
  assert.match(migration, /REFERENCES "public"\."notification_outbox"/);
});
