import "dotenv/config";

import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
import { startMaintenanceScheduler } from "./scheduler.js";

const config = loadConfig();
const connection = createDatabase(config.databaseUrl, 4);
const stopScheduler = startMaintenanceScheduler(connection.db, config.schedulerIntervalMs);
let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopScheduler();
  await connection.close();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
