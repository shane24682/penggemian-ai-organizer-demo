import assert from "node:assert/strict";
import test from "node:test";
import { opsQuery } from "../lib/p0-ops.ts";
import { opsActionSchema } from "../server/src/ops/actions.ts";
test("B6 metric query never imports list scope, status, exception or pagination filters", () => {
  const filters = { schoolId: "school", sceneCode: "MATH_MODELING" as const, from: "start", to: "end", sourceChannel: "REGROUP",
    dataScope: "TEST", status: "CANCELLED", exceptionsOnly: true };
  const metric = new URLSearchParams(opsQuery(filters, true, "cursor"));
  assert.deepEqual([...metric.keys()], ["schoolId", "sceneCode", "from", "to", "sourceChannel"]);
  const list = new URLSearchParams(opsQuery(filters, false, "cursor"));
  assert.equal(list.get("dataScope"), "TEST"); assert.equal(list.get("cursor"), "cursor"); assert.equal(list.get("limit"), "20"); assert.equal(list.get("exceptionsOnly"), "true");
});
test("B6 recording rejects fractional amounts, actor spoofing, unknown state actions and missing reason", () => {
  const base = { requestId: "20000000-0000-4000-8000-000000000001", reason: "跟进" };
  assert.equal(opsActionSchema.safeParse({ ...base, actionType: "LOG_WORK", minutesSpent: 1 }).success, true);
  for (const body of [{ ...base, actionType: "LOG_WORK", minutesSpent: 0 }, { ...base, actionType: "LOG_WORK", minutesSpent: 1, userId: base.requestId },
    { ...base, actionType: "FORCE_COMPLETE" }, { ...base, reason: " ", actionType: "LOG_WORK", minutesSpent: 1 },
    { ...base, actionType: "RECORD_COST", costType: "OTHER", amountCents: 1.5, incurredAt: new Date() }]) {
    assert.equal(opsActionSchema.safeParse(body).success, false);
  }
});
