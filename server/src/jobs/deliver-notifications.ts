import "dotenv/config";

import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
import { processNotificationOutbox } from "../notifications/service.js";

const config = loadConfig();
const connection = createDatabase(config.databaseUrl, 2);

try {
  // IN_APP delivery is complete once the persisted notification becomes visible
  // through GET /me/notifications; no external provider is called in P0.
  const results = await processNotificationOutbox(connection.db);
  const failed = results.filter(({ status }) => status === "FAILED" || status === "DEAD");
  console.log(`Notification delivery completed: ${results.length - failed.length} succeeded/skipped, ${failed.length} failed`);
  if (failed.some(({ status }) => status === "DEAD")) process.exitCode = 1;
} finally {
  await connection.close();
}
