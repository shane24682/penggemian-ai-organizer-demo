import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import {
  checkins, domainEvents, idempotencyRecords, regroupIntents, requestRoleSlots, requests,
  reviews, sessionMembers, sessions, statusEvents, userProfiles,
} from "../src/db/schema/index.js";
import { advanceDueSessions, advanceSessionInTransaction, submitCheckin } from "../src/fulfillment/service.js";

const config = loadConfig();
if (config.appEnv === "production") throw new Error("B4 integration tests must not run in production");
const connection = createDatabase(config.databaseUrl, 4);
const db = connection.db;
const app = createApp(config, connection);
const A = "20000000-0000-4000-8000-000000000001";
const B = "20000000-0000-4000-8000-000000000002";
const C = "20000000-0000-4000-8000-000000000003";
const SCHOOL = "10000000-0000-4000-8000-000000000001";
after(async () => connection.close());

const login = async (phoneE164: string) => {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneE164, password: "PenggemianTest!2026" }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { data: { accessToken: string } };
  return payload.data.accessToken;
};
const tokens = () => Promise.all([1, 2, 3, 4].map((i) => login(`+861380000000${i}`)));
const post = (path: string, token: string, key: string, body: unknown = {}) => app.request(path, {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
  body: JSON.stringify(body),
});
const get = (path: string, token: string) => app.request(path, { headers: { Authorization: `Bearer ${token}` } });
const score = async (userId: string) => {
  const [row] = await db.select({ score: userProfiles.trustScore }).from(userProfiles).where(eq(userProfiles.userId, userId));
  return row.score;
};

const fixture = async (status: typeof sessions.$inferInsert.status = "CONFIRMED", startsAt = new Date(Date.now() - 20 * 60_000)) => {
  const requestId = randomUUID();
  const sessionId = randomUUID();
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60_000);
  const scores = await Promise.all([A, B, C].map(score));
  await db.transaction(async (tx) => {
    await tx.insert(requests).values({ id: requestId, creatorUserId: A, schoolId: SCHOOL,
      title: "B4 集成测试", competitionName: "全国大学生数学建模竞赛", startsAt, endsAt,
      participantLimit: 3, applicationDeadline: new Date(startsAt.getTime() - 24 * 60 * 60_000),
      status: "FULFILLED", dataScope: "TEST" });
    const slots = await tx.insert(requestRoleSlots).values([
      { requestId, roleCode: "CODING", slotCount: 1, minLevel: 3 },
      { requestId, roleCode: "WRITING", slotCount: 1, minLevel: 3 },
    ]).returning();
    await tx.insert(sessions).values({ id: sessionId, requestId, schoolId: SCHOOL, startsAt, endsAt, status });
    await tx.insert(sessionMembers).values([
      { sessionId, userId: A, memberType: "HOST" },
      { sessionId, userId: B, memberType: "PARTICIPANT", roleSlotId: slots[0].id },
      { sessionId, userId: C, memberType: "PARTICIPANT", roleSlotId: slots[1].id },
    ]);
  });
  return { requestId, sessionId, startsAt, endsAt, scores };
};

const cleanup = async (data: Awaited<ReturnType<typeof fixture>>) => {
  await db.transaction(async (tx) => {
    const members = await tx.select({ id: sessionMembers.id }).from(sessionMembers).where(eq(sessionMembers.sessionId, data.sessionId));
    const attendance = await tx.select({ id: checkins.id }).from(checkins).where(eq(checkins.sessionId, data.sessionId));
    const reviewRows = await tx.select({ id: reviews.id }).from(reviews).where(eq(reviews.sessionId, data.sessionId));
    const intents = await tx.select({ id: regroupIntents.id }).from(regroupIntents).where(eq(regroupIntents.sessionId, data.sessionId));
    const nextRequests = await tx.select({ id: requests.id }).from(requests).where(eq(requests.sourceSessionId, data.sessionId));
    const aggregateIds = [data.requestId, data.sessionId, ...[members, attendance, reviewRows, intents, nextRequests].flat().map(({ id }) => id)];
    await tx.delete(statusEvents).where(inArray(statusEvents.aggregateId, aggregateIds));
    await tx.delete(domainEvents).where(eq(domainEvents.sessionId, data.sessionId));
    await tx.delete(idempotencyRecords).where(sql`${idempotencyRecords.idempotencyKey} like ${`${data.sessionId}:%`}`);
    await tx.delete(checkins).where(eq(checkins.sessionId, data.sessionId));
    await tx.delete(reviews).where(eq(reviews.sessionId, data.sessionId));
    await tx.delete(regroupIntents).where(eq(regroupIntents.sessionId, data.sessionId));
    await tx.delete(sessionMembers).where(eq(sessionMembers.sessionId, data.sessionId));
    await tx.delete(sessions).where(eq(sessions.id, data.sessionId));
    await tx.delete(requests).where(inArray(requests.id, [data.requestId, ...nextRequests.map(({ id }) => id)]));
    for (const [index, userId] of [A, B, C].entries()) {
      await tx.update(userProfiles).set({ trustScore: data.scores[index] }).where(eq(userProfiles.userId, userId));
    }
  });
};

test("B4 checkin, attendance settlement, private reviews and mutual regroup persist and replay safely", async () => {
  const [tokenA, tokenB, tokenC, tokenD] = await tokens();
  const data = await fixture();
  const base = `/api/v1/sessions/${data.sessionId}`;
  try {
    const qualification = await get(`${base}/checkins`, tokenB);
    assert.equal(qualification.status, 200);
    assert.equal((await qualification.json() as { data: { eligible: boolean } }).data.eligible, true);
    assert.equal((await get(`${base}/checkins`, tokenD)).status, 404);
    assert.equal((await post(`${base}/checkins`, tokenD, `${data.sessionId}:outsider`)).status, 404);

    const present = await db.transaction((tx) => submitCheckin(tx, data.sessionId, A, data.startsAt));
    assert.equal(present.status, "PRESENT");
    const clicks = await Promise.all(Array.from({ length: 10 }, () => post(`${base}/checkins`, tokenB, `${data.sessionId}:checkin-B`)));
    assert.ok(clicks.every((response) => response.status === 200));
    assert.equal(clicks.filter((response) => response.headers.get("Idempotency-Replayed") === "true").length, 9);
    const checkinPayload = await clicks[0].json() as { data: { status: string; userId: string } };
    assert.equal(checkinPayload.data.status, "LATE");
    assert.equal(checkinPayload.data.userId, B);
    assert.equal((await post(`${base}/checkins`, tokenB, `${data.sessionId}:another-checkin-key`)).status, 200);
    assert.equal(await score(A), Math.min(100, data.scores[0] + 2));
    assert.equal(await score(B), Math.min(100, data.scores[1] + 2));
    assert.equal((await post(`${base}/checkins`, tokenB, `${data.sessionId}:forged`, { userId: C, status: "PRESENT" })).status, 400);
    assert.equal((await post(`${base}/reviews`, tokenA, `${data.sessionId}:too-soon`, { revieweeUserId: B, rating: 5 })).status, 409);

    const endedAt = new Date(data.endsAt.getTime() + 1);
    await Promise.all(Array.from({ length: 3 }, () => db.transaction((tx) => advanceSessionInTransaction(tx, data.sessionId, endedAt))));
    const members = await db.select().from(sessionMembers).where(eq(sessionMembers.sessionId, data.sessionId));
    assert.equal(members.find((member) => member.userId === A)?.memberStatus, "COMPLETED");
    assert.equal(members.find((member) => member.userId === B)?.memberStatus, "COMPLETED");
    assert.equal(members.find((member) => member.userId === C)?.memberStatus, "NO_SHOW");
    const records = await db.select().from(checkins).where(eq(checkins.sessionId, data.sessionId));
    assert.equal(records.length, 3);
    assert.equal(records.find((row) => row.userId === C)?.checkedInAt, null);
    assert.equal(await score(C), Math.max(0, data.scores[2] - 10));
    assert.equal((await post(`${base}/checkins`, tokenC, `${data.sessionId}:absent`)).status, 409);
    assert.equal((await post(`${base}/reviews`, tokenC, `${data.sessionId}:absent-review`, { revieweeUserId: A, rating: 5 })).status, 409);

    const reviewBody = { revieweeUserId: B, rating: 5, tags: ["守时"], comment: "私人评价" };
    const reviewResponses = await Promise.all(Array.from({ length: 5 }, () => post(`${base}/reviews`, tokenA, `${data.sessionId}:review`, reviewBody)));
    assert.ok(reviewResponses.every((response) => response.status === 201));
    assert.equal((await post(`${base}/reviews`, tokenA, `${data.sessionId}:review`, { ...reviewBody, rating: 1 })).status, 409);
    assert.equal((await post(`${base}/reviews`, tokenA, `${data.sessionId}:duplicate-review`, reviewBody)).status, 409);
    assert.equal((await post(`${base}/reviews`, tokenA, `${data.sessionId}:self-review`, { revieweeUserId: A, rating: 5 })).status, 422);
    assert.equal((await post(`${base}/reviews`, tokenA, `${data.sessionId}:no-show-target`, { revieweeUserId: C, rating: 5 })).status, 422);
    assert.equal((await post(`${base}/reviews`, tokenA, `${data.sessionId}:bad-rating`, { revieweeUserId: B, rating: 6 })).status, 400);
    const ownReviews = await get(`${base}/reviews`, tokenA);
    assert.equal((await ownReviews.json() as { data: unknown[] }).data.length, 1);
    const otherReviews = await get(`${base}/reviews`, tokenB);
    assert.equal((await otherReviews.json() as { data: unknown[] }).data.length, 0);
    assert.equal((await get(`${base}/reviews`, tokenD)).status, 404);
    assert.equal(await score(B), Math.min(100, data.scores[1] + 2));

    const intentA = await post(`${base}/regroup-intents`, tokenA, `${data.sessionId}:intent-A`, { willingUserIds: [B] });
    assert.equal(intentA.status, 200);
    const hidden = await get(`${base}/regroup-intents`, tokenB);
    assert.deepEqual((await hidden.json() as { data: unknown }).data, { intent: null, mutualUserIds: [] });
    const future = new Date(Date.now() + 72 * 60 * 60_000);
    const nextBody = { startsAt: future.toISOString(), endsAt: new Date(future.getTime() + 2 * 60 * 60_000).toISOString(),
      applicationDeadline: new Date(future.getTime() - 24 * 60 * 60_000).toISOString() };
    assert.equal((await post(`${base}/regroup`, tokenA, `${data.sessionId}:one-sided-regroup`, nextBody)).status, 409);
    assert.equal((await post(`${base}/regroup-intents`, tokenB, `${data.sessionId}:intent-B`, { willingUserIds: [A] })).status, 200);
    const mutual = await get(`${base}/regroup-intents`, tokenA);
    const mutualPayload = await mutual.json() as { data: { intent: { status: string }; mutualUserIds: string[] } };
    assert.equal(mutualPayload.data.intent.status, "MATCHED");
    assert.deepEqual(mutualPayload.data.mutualUserIds, [B]);
    assert.equal((await post(`${base}/regroup-intents`, tokenB, `${data.sessionId}:withdraw-intent`, { willingUserIds: [] })).status, 200);
    const unmatched = await get(`${base}/regroup-intents`, tokenA);
    const unmatchedPayload = await unmatched.json() as { data: { intent: { status: string }; mutualUserIds: string[] } };
    assert.equal(unmatchedPayload.data.intent.status, "OPEN");
    assert.deepEqual(unmatchedPayload.data.mutualUserIds, []);
    assert.equal((await post(`${base}/regroup-intents`, tokenB, `${data.sessionId}:renew-intent`, { willingUserIds: [A] })).status, 200);
    const missingKey = await app.request(`${base}/regroup-intents`, {
      method: "POST", headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ willingUserIds: [B] }),
    });
    assert.equal(missingKey.status, 400);
    assert.equal((await post(`${base}/regroup-intents`, tokenA, `${data.sessionId}:bad-intent`, { willingUserIds: [C] })).status, 422);
    assert.equal((await get(`${base}/regroup-intents`, tokenD)).status, 404);
    assert.equal((await post(`${base}/regroup`, tokenB, `${data.sessionId}:invalid-time`, { ...nextBody, endsAt: new Date(future.getTime() - 1).toISOString() })).status, 422);

    const regroupResponses = await Promise.all(Array.from({ length: 5 }, () => post(`${base}/regroup`, tokenA, `${data.sessionId}:regroup`, nextBody)));
    assert.ok(regroupResponses.every((response) => response.status === 201));
    const created = await regroupResponses[0].json() as { data: { id: string; sourceSessionId: string; status: string } };
    assert.equal(created.data.sourceSessionId, data.sessionId);
    assert.equal(created.data.status, "OPEN");
    assert.equal((await post(`${base}/regroup`, tokenA, `${data.sessionId}:regroup`, { ...nextBody, startsAt: new Date(future.getTime() + 60_000).toISOString() })).status, 409);
    assert.equal((await post(`${base}/regroup`, tokenA, `${data.sessionId}:other-regroup-key`, nextBody)).status, 201);
    const newRequests = await db.select().from(requests).where(eq(requests.sourceSessionId, data.sessionId));
    assert.equal(newRequests.length, 1);
    const reload = await get(`/api/v1/requests/${created.data.id}`, tokenA);
    assert.equal(reload.status, 200);
    assert.equal((await reload.json() as { data: { roleSlots: unknown[] } }).data.roleSlots.length, 2);
    const events = await db.select().from(domainEvents).where(eq(domainEvents.sessionId, data.sessionId));
    assert.equal(events.filter((row) => row.eventType === "TRUST_SCORE_CHANGED").length, 3);
    assert.ok(events.some((row) => row.eventType === "SESSION_COMPLETED"));
    assert.ok(events.some((row) => row.eventType === "REGROUP_REQUEST_CREATED"));
    assert.ok(events.every((row) => row.dataScope === "TEST"));
  } finally { await cleanup(data); }
});

test("B4 cancelled and forming sessions reject writes and do not penalize members", async () => {
  const [tokenA] = await tokens();
  for (const status of ["CANCELLED", "FORMING"] as const) {
    const data = await fixture(status);
    const base = `/api/v1/sessions/${data.sessionId}`;
    try {
      assert.equal((await post(`${base}/checkins`, tokenA, `${data.sessionId}:checkin`)).status, 409);
      assert.equal((await post(`${base}/reviews`, tokenA, `${data.sessionId}:review`, { revieweeUserId: B, rating: 5 })).status, 409);
      assert.equal((await post(`${base}/regroup-intents`, tokenA, `${data.sessionId}:intent`, { willingUserIds: [B] })).status, 409);
      await db.transaction((tx) => advanceSessionInTransaction(tx, data.sessionId, new Date(data.endsAt.getTime() + 1)));
      assert.equal(await score(A), data.scores[0]);
      assert.equal((await db.select().from(checkins).where(eq(checkins.sessionId, data.sessionId))).length, 0);
    } finally { await cleanup(data); }
  }
});

test("B4 early/withdrawn checkins are rejected and withdrawn members are not marked absent", async () => {
  const [tokenA, , tokenC] = await tokens();
  const data = await fixture("CONFIRMED", new Date(Date.now() + 2 * 60 * 60_000));
  const base = `/api/v1/sessions/${data.sessionId}`;
  try {
    assert.equal((await post(`${base}/checkins`, tokenA, `${data.sessionId}:too-early`)).status, 409);
    await db.update(sessionMembers).set({ memberStatus: "WITHDRAWN" })
      .where(and(eq(sessionMembers.sessionId, data.sessionId), eq(sessionMembers.userId, C)));
    assert.equal((await post(`${base}/checkins`, tokenC, `${data.sessionId}:withdrawn`)).status, 409);
    await db.transaction((tx) => advanceSessionInTransaction(tx, data.sessionId, new Date(data.endsAt.getTime() + 1)));
    assert.equal(await score(C), data.scores[2]);
    const [withdrawnCheckin] = await db.select().from(checkins).where(and(eq(checkins.sessionId, data.sessionId), eq(checkins.userId, C)));
    assert.equal(withdrawnCheckin, undefined);
  } finally { await cleanup(data); }
});

test("B4 scheduler advances due sessions without repeatedly scanning active sessions", async () => {
  const data = await fixture();
  try {
    const started = await advanceDueSessions(db, new Date());
    assert.ok(started.some((result) => result.sessionId === data.sessionId && result.success));
    const [active] = await db.select().from(sessions).where(eq(sessions.id, data.sessionId));
    assert.equal(active.status, "IN_PROGRESS");
    const notDueAgain = await advanceDueSessions(db, new Date());
    assert.ok(notDueAgain.every((result) => result.sessionId !== data.sessionId));
    const finished = await advanceDueSessions(db, new Date(data.endsAt.getTime() + 1));
    assert.ok(finished.some((result) => result.sessionId === data.sessionId && result.success));
    const [completed] = await db.select().from(sessions).where(eq(sessions.id, data.sessionId));
    assert.equal(completed.status, "COMPLETED");
    const afterCompleted = await advanceDueSessions(db, new Date(data.endsAt.getTime() + 60_000));
    assert.ok(afterCompleted.every((result) => result.sessionId !== data.sessionId));
    assert.equal(await score(A), Math.max(0, data.scores[0] - 10));
  } finally { await cleanup(data); }
});
