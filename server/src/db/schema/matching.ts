import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { matchCandidateStatusEnum, matchCandidateTypeEnum, matchRunStatusEnum } from "./enums.js";
import { users } from "./identity.js";
import { requestRoleSlots, requests } from "./requests.js";

export type MatchBreakdownRecord = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  detail: string;
};

export const matchRuns = pgTable(
  "match_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    contractVersion: text("contract_version").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    status: matchRunStatusEnum("status").default("RUNNING").notNull(),
    parametersJson: jsonb("parameters_json").$type<Record<string, unknown>>().default({}).notNull(),
    candidateCount: integer("candidate_count").default(0).notNull(),
    isCurrent: boolean("is_current").default(false).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("match_runs_request_created_idx").on(table.requestId, table.createdAt),
    uniqueIndex("match_runs_current_request_unique")
      .on(table.requestId)
      .where(sql`${table.isCurrent} = true and ${table.status} = 'SUCCEEDED'`),
  ],
);

export const matchCandidates = pgTable(
  "match_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchRunId: uuid("match_run_id")
      .notNull()
      .references(() => matchRuns.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleSlotId: uuid("role_slot_id")
      .notNull()
      .references(() => requestRoleSlots.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    candidateType: matchCandidateTypeEnum("candidate_type").notNull(),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    breakdownJson: jsonb("breakdown_json").$type<MatchBreakdownRecord[]>().default([]).notNull(),
    reasonsJson: jsonb("reasons_json").$type<string[]>().default([]).notNull(),
    candidateStatus: matchCandidateStatusEnum("candidate_status").default("RANKED").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("match_candidates_rank_check", sql`${table.rank} > 0`),
    check("match_candidates_score_check", sql`${table.score} between 0 and 100`),
    uniqueIndex("match_candidates_run_user_unique").on(table.matchRunId, table.userId),
    index("match_candidates_run_rank_idx").on(table.matchRunId, table.rank),
    index("match_candidates_request_user_idx").on(table.requestId, table.userId),
  ],
);
