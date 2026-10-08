import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "../src/db/client.js";
import { startMaintenanceScheduler } from "../src/jobs/scheduler.js";

test("maintenance scheduler waits for the active cycle and stops without scheduling another", async () => {
  let calls = 0;
  let release!: () => void;
  const activeCycle = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stop = startMaintenanceScheduler({} as Database, 10, async () => {
    calls += 1;
    await activeCycle;
  });

  assert.equal(calls, 1);
  const stopped = stop();
  release();
  await stopped;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1);
});
