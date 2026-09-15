import "dotenv/config";

import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
import { expirePendingInvitations } from "../invitations/service.js";

const config = loadConfig();
const connection = createDatabase(config.databaseUrl, 2);

try {
  const results = await expirePendingInvitations(connection.db);
  const failed = results.filter(({ success }) => !success);
  console.log(`Invitation expiry scan completed: ${results.length - failed.length} succeeded, ${failed.length} failed`);
  if (failed.length) {
    console.error(failed);
    process.exitCode = 1;
  }
} finally {
  await connection.close();
}
