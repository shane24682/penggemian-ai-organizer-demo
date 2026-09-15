import "dotenv/config";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";

const config = loadConfig();
const connection = createDatabase(config.databaseUrl);
const app = createApp(config, connection);

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Business API listening on http://localhost:${info.port}`);
});

const shutdown = async () => {
  server.close();
  await connection.close();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
