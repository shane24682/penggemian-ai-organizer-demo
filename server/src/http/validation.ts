import type { Context } from "hono";
import type { ZodType } from "zod";

import { ApiError } from "./errors.js";

export const parseJson = async <T>(context: Context, schema: ZodType<T>): Promise<T> => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "请求体必须是合法JSON");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "请求字段不符合要求", {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return result.data;
};
