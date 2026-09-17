import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("B7 refuses unsafe environments before connecting and does not echo credentials", () => {
  const secret = "never-echo-this-test-password";
  const base = { ...process.env, APP_ENV: "test", B7_ISOLATED_DB: "1", JWT_SECRET: "dedicated-test-secret", DATABASE_URL: `postgresql://test:${secret}@127.0.0.1:1/test_b7` };
  for (const [overrides, expected] of [
    [{ APP_ENV: "production" }, "B7 requires"], [{ B7_ISOLATED_DB: "0" }, "B7 requires"],
    [{ DATABASE_URL: `postgresql://test:${secret}@127.0.0.1:1/postgres` }, "dedicated application TEST database"],
    [{ DATABASE_URL: "invalid-connection-url" }, "not a valid PostgreSQL URL"],
    [{ DATABASE_URL: `https://test:${secret}@127.0.0.1:1/test_b7` }, "PostgreSQL protocol"],
  ]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-b7.mjs"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)), env: { ...base, ...overrides }, encoding: "utf8", timeout: 10_000, windowsHide: true,
    });
    assert.equal(result.status, 1); const output = result.stdout + result.stderr;
    assert.ok(output.includes(expected)); assert.equal(output.includes(secret), false);
  }
});
