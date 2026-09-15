import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../src/http/errors.js";
import { decideInvitationTransition, isSessionFulfilled } from "../src/invitations/state-machine.js";

const now = new Date("2026-09-16T00:00:00.000Z");
const future = new Date("2026-09-16T06:00:00.000Z");

test("pending invitation can be accepted or declined", () => {
  assert.deepEqual(decideInvitationTransition("PENDING", "ACCEPT", future, now), {
    kind: "TRANSITION",
    toStatus: "ACCEPTED",
  });
  assert.deepEqual(decideInvitationTransition("PENDING", "DECLINE", future, now), {
    kind: "TRANSITION",
    toStatus: "DECLINED",
  });
});

test("an elapsed invitation expires instead of accepting", () => {
  assert.deepEqual(decideInvitationTransition("PENDING", "ACCEPT", now, now), {
    kind: "TRANSITION",
    toStatus: "EXPIRED",
  });
});

test("the timeout worker can explicitly expire a pending invitation", () => {
  assert.deepEqual(decideInvitationTransition("PENDING", "EXPIRE", now, now), {
    kind: "TRANSITION",
    toStatus: "EXPIRED",
  });
});

test("repeating the same terminal action is idempotent", () => {
  assert.deepEqual(decideInvitationTransition("ACCEPTED", "ACCEPT", future, now), {
    kind: "IDEMPOTENT",
    toStatus: "ACCEPTED",
  });
});

test("a different action cannot change a terminal invitation", () => {
  assert.throws(
    () => decideInvitationTransition("DECLINED", "ACCEPT", future, now),
    (error) => error instanceof ApiError && error.code === "INVITATION_NOT_PENDING",
  );
});

test("a queued backup cannot respond before promotion", () => {
  assert.throws(
    () => decideInvitationTransition("QUEUED", "ACCEPT", null, now),
    (error) => error instanceof ApiError && error.code === "INVITATION_NOT_PENDING",
  );
});

test("session fulfillment includes the host and never requires an exact count", () => {
  assert.equal(isSessionFulfilled(2, 3), false);
  assert.equal(isSessionFulfilled(3, 3), true);
  assert.equal(isSessionFulfilled(4, 3), true);
});
