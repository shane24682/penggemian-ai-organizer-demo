import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../src/http/errors.js";
import { hashIdempotencyRequest, requireIdempotencyKey } from "../src/idempotency/service.js";

test("idempotency request hashes are stable across object key order", () => {
  assert.equal(
    hashIdempotencyRequest({ invitationId: "1", action: "ACCEPT" }),
    hashIdempotencyRequest({ action: "ACCEPT", invitationId: "1" }),
  );
  assert.notEqual(
    hashIdempotencyRequest({ invitationId: "1", action: "ACCEPT" }),
    hashIdempotencyRequest({ invitationId: "1", action: "DECLINE" }),
  );
});

test("idempotency key is required and bounded", () => {
  assert.throws(
    () => requireIdempotencyKey(undefined),
    (error) => error instanceof ApiError && error.code === "IDEMPOTENCY_KEY_REQUIRED",
  );
  assert.throws(
    () => requireIdempotencyKey("x".repeat(129)),
    (error) => error instanceof ApiError && error.code === "IDEMPOTENCY_KEY_INVALID",
  );
  assert.equal(requireIdempotencyKey(" request-1 "), "request-1");
});

test("parsed regroup dates contribute to the idempotency request hash", () => {
  assert.notEqual(
    hashIdempotencyRequest({ startsAt: new Date("2026-09-20T10:00:00Z") }),
    hashIdempotencyRequest({ startsAt: new Date("2026-09-21T10:00:00Z") }),
  );
  assert.equal(
    hashIdempotencyRequest({ startsAt: new Date("2026-09-20T10:00:00Z") }),
    hashIdempotencyRequest({ startsAt: "2026-09-20T10:00:00.000Z" }),
  );
});
