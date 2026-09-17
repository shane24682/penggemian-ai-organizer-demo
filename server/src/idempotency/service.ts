import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../db/client.js";
import { idempotencyRecords } from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const stableJson = (value: unknown): string => {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
};

export const hashIdempotencyRequest = (value: unknown) =>
  createHash("sha256").update(stableJson(value)).digest("hex");

export const requireIdempotencyKey = (value: string | undefined) => {
  const key = value?.trim();
  if (!key) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "缺少 Idempotency-Key 请求头");
  if (key.length > 128) throw new ApiError(400, "IDEMPOTENCY_KEY_INVALID", "Idempotency-Key 长度不能超过 128");
  return key;
};

export type IdempotentResult<T> = {
  data: T;
  status: 200 | 201;
  replayed: boolean;
};

export const runIdempotentTransaction = async <T>(
  db: Database,
  input: {
    userId: string;
    routeKey: string;
    idempotencyKey: string;
    request: unknown;
    now?: Date;
  },
  operation: (tx: DatabaseTransaction) => Promise<{ data: T; status?: 200 | 201 }>,
): Promise<IdempotentResult<T>> => {
  const requestHash = hashIdempotencyRequest(input.request);
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    await tx
      .insert(idempotencyRecords)
      .values({
        userId: input.userId,
        routeKey: input.routeKey,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      })
      .onConflictDoNothing({
        target: [idempotencyRecords.userId, idempotencyRecords.routeKey, idempotencyRecords.idempotencyKey],
      });

    await tx.execute(
      sql`select id from idempotency_records where user_id = ${input.userId} and route_key = ${input.routeKey} and idempotency_key = ${input.idempotencyKey} for update`,
    );
    const [record] = await tx
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.userId, input.userId),
          eq(idempotencyRecords.routeKey, input.routeKey),
          eq(idempotencyRecords.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (!record) throw new Error("Idempotency reservation disappeared");
    if (record.requestHash !== requestHash) {
      throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "该 Idempotency-Key 已用于不同请求");
    }
    if (record.responseStatus !== null && record.responseJson !== null) {
      return {
        data: record.responseJson as T,
        status: record.responseStatus === 201 ? 201 : 200,
        replayed: true,
      };
    }

    const result = await operation(tx);
    const status = result.status ?? 200;
    await tx
      .update(idempotencyRecords)
      .set({ responseStatus: status, responseJson: result.data })
      .where(eq(idempotencyRecords.id, record.id));
    return { data: result.data, status, replayed: false };
  });
};
