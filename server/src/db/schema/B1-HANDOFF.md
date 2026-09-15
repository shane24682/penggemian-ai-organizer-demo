# B1 Schema handoff

`lifecycle.ts` owns the eleven contract-v0.1 tables assigned to负责人 B. It does not
define or generate migrations for Floyd's tables.

Implemented coverage:

- lifecycle: `sessions`, `session_members`, `invitations`, `status_events`;
- fulfilment: `checkins`, `reviews`, `regroup_intents`;
- notification/operations: `notification_outbox`, `domain_events`,
  `ops_work_logs`, `cost_items`;
- contract enums, UUID/timestamptz defaults, foreign keys with restrictive
  deletion, duplicate-write guards, invalid-value checks, and required indexes.

The unified A-owned schema entrypoint should instantiate and re-export B1 once:

The integration is now complete: `schema/index.ts` re-exports `lifecycle.ts`,
which instantiates B1 against A's real `schools`, `users`, `requests`,
`requestRoleSlots`, and `matchCandidates` tables.

All A/B enums now share `enums.ts`, and the unified entrypoint exports them so
Drizzle Kit emits their `CREATE TYPE` statements. The migration history is now
unified without rewriting A's baseline: `0000_black_mindworm.sql` creates A's
core tables, then `0001_overconfident_satana.sql` creates all eleven B1 tables,
their enums, foreign keys, checks, unique constraints, and indexes. A fresh
database running `npm run db:migrate` applies both in order.

`../../../test/fixtures/b1-fixtures.ts` supplies deterministic B-owned TEST rows. The unified
seed job passes A's school, users, request, role-slot, and match-candidate IDs to
`createB1SeedRows(refs)`, then inserts the returned arrays in dependency order.
The return type is derived from the B1 Drizzle tables, so fixture/schema drift is
caught during type checking.
