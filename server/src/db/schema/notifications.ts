import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { deliveryAttemptStatusEnum } from "./enums.js";
import { notificationOutbox } from "./lifecycle.js";

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    outboxId: uuid("outbox_id")
      .notNull()
      .references(() => notificationOutbox.id, { onDelete: "restrict", onUpdate: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    status: deliveryAttemptStatusEnum("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("delivery_attempts_outbox_attempt_unique").on(table.outboxId, table.attemptNo),
    index("delivery_attempts_outbox_started_at_idx").on(table.outboxId, table.startedAt),
    check("delivery_attempts_attempt_no_range", sql`${table.attemptNo} between 1 and 3`),
  ],
);
