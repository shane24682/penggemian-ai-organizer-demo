import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../src/http/errors.js";
import { assertCompletedParticipant, boundedTrustScore, decideCheckin, mutuallyWillingUserIds } from "../src/fulfillment/rules.js";

const startsAt = new Date("2026-09-20T10:00:00Z");
const session = { status: "CONFIRMED", startsAt, endsAt: new Date("2026-09-20T12:00:00Z") };
const codeIs = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

test("checkin window opens thirty minutes early, is inclusive at opening, and excludes ending", () => {
  assert.throws(() => decideCheckin(session, "CONFIRMED", new Date("2026-09-20T09:29:59Z")), codeIs("CHECKIN_WINDOW_CLOSED"));
  assert.equal(decideCheckin(session, "CONFIRMED", new Date("2026-09-20T09:30:00Z")), "PRESENT");
  assert.throws(() => decideCheckin(session, "CONFIRMED", session.endsAt), codeIs("CHECKIN_WINDOW_CLOSED"));
});

test("late classification is server-controlled and starts after fifteen minutes", () => {
  assert.equal(decideCheckin(session, "CONFIRMED", new Date("2026-09-20T10:15:00Z")), "PRESENT");
  assert.equal(decideCheckin({ ...session, status: "IN_PROGRESS" }, "CONFIRMED", new Date("2026-09-20T10:15:01Z")), "LATE");
});

test("forming, cancelled, completed activities cannot accept new checkins", () => {
  for (const status of ["FORMING", "CANCELLED", "COMPLETED"]) {
    assert.throws(() => decideCheckin({ ...session, status }, "CONFIRMED", startsAt), codeIs("CHECKIN_NOT_ALLOWED"));
  }
});

test("withdrawn, absent and completed members cannot submit new checkins", () => {
  for (const status of ["WITHDRAWN", "NO_SHOW", "COMPLETED"]) {
    assert.throws(() => decideCheckin(session, status, startsAt), codeIs("CHECKIN_NOT_ALLOWED"));
  }
});

test("reviews and regroup require completed attendance, not just membership", () => {
  assert.doesNotThrow(() => assertCompletedParticipant("COMPLETED", "COMPLETED"));
  for (const [status, member] of [["CANCELLED", "CONFIRMED"], ["IN_PROGRESS", "CONFIRMED"], ["COMPLETED", "NO_SHOW"], ["COMPLETED", "WITHDRAWN"]]) {
    assert.throws(() => assertCompletedParticipant(status, member), codeIs("COMPLETED_PARTICIPATION_REQUIRED"));
  }
});

test("trust changes clamp at zero and one hundred", () => {
  assert.equal(boundedTrustScore(99, 2), 100);
  assert.equal(boundedTrustScore(5, -10), 0);
  assert.equal(boundedTrustScore(80, 2), 82);
});

test("mutual regroup excludes one-sided, withdrawn and closed choices", () => {
  const intents = [
    { userId: "B", willingUserIdsJson: ["A"], status: "OPEN" },
    { userId: "C", willingUserIdsJson: [], status: "OPEN" },
    { userId: "D", willingUserIdsJson: ["A"], status: "CLOSED" },
  ];
  assert.deepEqual(mutuallyWillingUserIds("A", ["B", "C", "D"], intents), ["B"]);
  assert.deepEqual(mutuallyWillingUserIds("A", [], intents), []);
});
