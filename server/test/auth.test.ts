import assert from "node:assert/strict";
import test from "node:test";

import { createAccessToken, verifyAccessToken } from "../src/auth/jwt.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

const secret = "test-secret-that-is-longer-than-thirty-two-characters";

test("passwords are salted and verifiable", async () => {
  const first = await hashPassword("PenggemianTest!2026");
  const second = await hashPassword("PenggemianTest!2026");

  assert.notEqual(first, second);
  assert.equal(await verifyPassword("PenggemianTest!2026", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
  assert.equal(await verifyPassword("anything", "invalid"), false);
});

test("access tokens preserve only the frozen identity claims", async () => {
  const auth = {
    userId: "20000000-0000-4000-8000-000000000001",
    schoolId: "10000000-0000-4000-8000-000000000001",
    role: "USER" as const,
  };
  const token = await createAccessToken(auth, secret);
  assert.deepEqual(await verifyAccessToken(token, secret), auth);
  await assert.rejects(() => verifyAccessToken(token, `${secret}-different`));
});
