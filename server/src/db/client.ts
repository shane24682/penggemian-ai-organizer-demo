import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export const createDatabase = (databaseUrl: string, maxConnections = 10) => {
  const sql = postgres(databaseUrl, {
    max: maxConnections,
    prepare: false,
  });
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: () => sql.end(),
  };
};

export type DatabaseConnection = ReturnType<typeof createDatabase>;
export type Database = DatabaseConnection["db"];
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
