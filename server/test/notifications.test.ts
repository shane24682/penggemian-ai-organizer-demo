import assert from "node:assert/strict";
import test from "node:test";

import { assertNotificationPayloadSafe, nextNotificationAttemptAt } from "../src/notifications/service.js";

const now = new Date("2026-09-16T00:00:00.000Z");

test("notification retries use immediate, one-minute and five-minute schedule", () => {
  assert.equal(nextNotificationAttemptAt(1, now)?.toISOString(), "2026-09-16T00:01:00.000Z");
  assert.equal(nextNotificationAttemptAt(2, now)?.toISOString(), "2026-09-16T00:05:00.000Z");
  assert.equal(nextNotificationAttemptAt(3, now), null);
});

test("notification payload accepts identifiers but rejects sensitive profile fields", () => {
  assert.doesNotThrow(() =>
    assertNotificationPayloadSafe({ invitationId: "id", requestId: "id", nested: { sessionId: "id" } }),
  );
  assert.throws(() => assertNotificationPayloadSafe({ phoneE164: "+8613800000000" }), /Sensitive notification field/);
  assert.throws(() => assertNotificationPayloadSafe({ evidenceUrl: "private" }), /Sensitive notification field/);
});
