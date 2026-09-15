import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

test("server config validates and normalizes environment values", () => {
  const config = loadConfig({
    APP_ENV: "test",
    PORT: "9900",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-longer-than-thirty-two-characters",
    CORS_ORIGIN: "http://localhost:3000",
  });
  assert.equal(config.appEnv, "test");
  assert.equal(config.port, 9900);
});

test("server config fails when secrets or database URL are missing", () => {
  assert.throws(() => loadConfig({ APP_ENV: "test" }), /Invalid server environment/);
});
