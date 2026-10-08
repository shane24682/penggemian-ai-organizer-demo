import { z } from "zod";

const environmentSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url(),
  ENABLE_SCHEDULER: z.enum(["0", "1", "false", "true"]).default("false"),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),
});

export type AppConfig = {
  appEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigin: string;
  schedulerEnabled: boolean;
  schedulerIntervalMs: number;
};

export const loadConfig = (environment: Record<string, string | undefined> = process.env): AppConfig => {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid server environment: ${z.prettifyError(result.error)}`);
  }

  return {
    appEnv: result.data.APP_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    jwtSecret: result.data.JWT_SECRET,
    corsOrigin: result.data.CORS_ORIGIN,
    schedulerEnabled: result.data.ENABLE_SCHEDULER === "1" || result.data.ENABLE_SCHEDULER === "true",
    schedulerIntervalMs: result.data.SCHEDULER_INTERVAL_MS,
  };
};
