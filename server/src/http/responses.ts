import type { Context } from "hono";

import type { AppEnv } from "./types.js";

export const success = <T>(context: Context<AppEnv>, data: T, status: 200 | 201 = 200) =>
  context.json({ data, meta: { requestId: context.get("requestId") } }, status);
