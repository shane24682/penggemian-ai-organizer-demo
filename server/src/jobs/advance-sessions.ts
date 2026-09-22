import "dotenv/config";

import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
import { advanceDueSessions } from "../fulfillment/service.js";

const config = loadConfig();
const connection = createDatabase(config.databaseUrl, 2);
try {
  const results = await advanceDueSessions(connection.db);
  const failed = results.filter((result) => !result.success);
  console.log(`Session lifecycle scan: ${results.length - failed.length} succeeded, ${failed.length} failed`);
  if (failed.length) { console.error(failed); process.exitCode = 1; }
} finally {
  await connection.close();
}
