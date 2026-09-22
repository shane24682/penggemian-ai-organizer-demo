import "dotenv/config";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { loadConfig } from "../config.js";
import { createDatabase } from "./client.js";

const config = loadConfig();
const connection = createDatabase(config.databaseUrl, 1);

try {
  await migrate(connection.db, { migrationsFolder: "server/drizzle" });
  console.log("Database migrations completed");
} finally {
  await connection.close();
}
