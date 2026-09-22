import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { createAccessToken } from "../src/auth/jwt.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import * as s from "../src/db/schema/index.js";

const config = loadConfig();
if (config.appEnv !== "test") throw new Error("B6 integration requires an isolated TEST database");
const connection = createDatabase(config.databaseUrl, 4); const db = connection.db;
const app = createApp(config, connection);
after(() => connection.close());
const A = "20000000-0000-4000-8000-000000000001"; const B = "20000000-0000-4000-8000-000000000002";
const SCHOOL = "10000000-0000-4000-8000-000000000001";

test("B6 ops records are permission-scoped, append-only, idempotent and fully traceable", async () => {
  const opsId = randomUUID(); const foreignSchool = randomUUID(); const foreignOps = randomUUID();
  const requestId = randomUUID(); const sessionId = randomUUID(); const secondId = randomUUID();
  const channel = `B6-${requestId}`; const stamp = new Date(); const from = new Date(stamp.getTime() - 3600_000); const to = new Date(stamp.getTime() + 3600_000);
  const opsToken = await createAccessToken({ userId: opsId, schoolId: SCHOOL, role: "OPS" }, config.jwtSecret);
  const foreignToken = await createAccessToken({ userId: foreignOps, schoolId: foreignSchool, role: "OPS" }, config.jwtSecret);
  const userToken = await createAccessToken({ userId: B, schoolId: SCHOOL, role: "USER" }, config.jwtSecret);
  const get = (path: string, token = opsToken) => app.request(path, { headers: { Authorization: `Bearer ${token}` } });
  const post = (body: unknown, key = `b6:${requestId}:work`, token = opsToken) => app.request("/api/v1/ops/actions", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });
  try {
    await db.insert(s.schools).values({ id: foreignSchool, code: foreignSchool, name: foreignSchool });
    await db.insert(s.users).values([{ id: opsId, schoolId: SCHOOL, phoneE164: `test-${opsId.slice(0, 24)}`, passwordHash: "test-only", role: "OPS" },
      { id: foreignOps, schoolId: foreignSchool, phoneE164: `test-${foreignOps.slice(0, 24)}`, passwordHash: "test-only", role: "OPS" }]);
    for (const id of [requestId, secondId]) await db.insert(s.requests).values({ id, schoolId: SCHOOL, creatorUserId: A,
      title: `B6 ${id}`, competitionName: "数模", startsAt: stamp, endsAt: new Date(stamp.getTime() + 3600_000),
      applicationDeadline: stamp, sourceChannel: channel, status: id === requestId ? "FULFILLED" : "OPEN", dataScope: "REAL", createdAt: stamp });
    await db.insert(s.sessions).values({ id: sessionId, requestId, schoolId: SCHOOL, startsAt: stamp,
      endsAt: new Date(stamp.getTime() + 3600_000), status: "COMPLETED" });
    const [member] = await db.insert(s.sessionMembers).values({ sessionId, userId: A, memberType: "HOST", memberStatus: "COMPLETED" }).returning();
    const [checkin] = await db.insert(s.checkins).values({ sessionId, userId: A, status: "PRESENT", checkedInAt: stamp }).returning();
    const [review] = await db.insert(s.reviews).values({ sessionId, reviewerUserId: A, revieweeUserId: B, rating: 5 }).returning();
    const [intent] = await db.insert(s.regroupIntents).values({ sessionId, userId: A }).returning();
    await db.insert(s.statusEvents).values([
      { aggregateType: "REQUEST", aggregateId: requestId, eventType: "REQUEST_FULFILLED", fromStatus: "INVITING", toStatus: "FULFILLED" },
      { aggregateType: "SESSION", aggregateId: sessionId, eventType: "SESSION_CONFIRMED", fromStatus: "FORMING", toStatus: "CONFIRMED" },
      { aggregateType: "SESSION", aggregateId: sessionId, eventType: "SESSION_COMPLETED", fromStatus: "IN_PROGRESS", toStatus: "COMPLETED" },
      ...[member, checkin, review, intent].map(({ id }) => ({ aggregateType: "TEST", aggregateId: id, eventType: "B6_TRACE", toStatus: "RECORDED" })),
    ]);
    await db.insert(s.opsWorkLogs).values({ opsUserId: opsId, sessionId, actionType: "FOLLOW_UP", minutesSpent: 2 });
    await db.insert(s.costItems).values({ schoolId: SCHOOL, sessionId, costType: "OTHER", amountCents: 100, incurredAt: stamp });
    const [slot] = await db.insert(s.requestRoleSlots).values({ requestId, roleCode: "CODING", slotCount: 1, minLevel: 1 }).returning();
    const [run] = await db.insert(s.matchRuns).values({ requestId, contractVersion: "contract-v0.1", algorithmVersion: "match-rules-v0.1", status: "SUCCEEDED" }).returning();
    const [candidate] = await db.insert(s.matchCandidates).values({ requestId, matchRunId: run.id, roleSlotId: slot.id, userId: B, rank: 1, candidateType: "PRIMARY", score: "80" }).returning();
    const [invite] = await db.insert(s.invitations).values({ requestId, sessionId, matchCandidateId: candidate.id,
      roleSlotId: slot.id, inviteeUserId: B, status: "EXPIRED", queuePosition: 0 }).returning();
    const [notification] = await db.insert(s.notificationOutbox).values({ recipientUserId: B, templateCode: "TEST", aggregateType: "INVITATION",
      aggregateId: invite.id, idempotencyKey: `b6:${requestId}:notify`, status: "DEAD", attemptCount: 3 }).returning();
    await db.insert(s.deliveryAttempts).values({ outboxId: notification.id, attemptNo: 1, status: "FAILED", startedAt: stamp, finishedAt: stamp, errorCode: "TEST" });
    assert.equal((await get("/api/v1/ops/flows", userToken)).status, 403);
    assert.equal((await get(`/api/v1/ops/flows?schoolId=${SCHOOL}`, foreignToken)).status, 403);
    assert.equal((await get(`/api/v1/ops/flows/${requestId}`, foreignToken)).status, 404);
    const filter = `/api/v1/ops/flows?sourceChannel=${channel}&limit=1`;
    const first = await (await get(filter)).json() as { data: { items: { requestId: string }[]; pagination: { nextCursor: string } } };
    const next = await (await get(`${filter}&cursor=${first.data.pagination.nextCursor}`)).json() as typeof first;
    assert.equal(first.data.items.length, 1); assert.equal(next.data.items.length, 1);
    assert.notEqual(first.data.items[0].requestId, next.data.items[0].requestId);
    assert.equal((await get(`${filter}&cursor=${randomUUID()}`)).status, 400);
    const exceptions = await (await get(`${filter}&exceptionsOnly=true`)).json() as typeof first;
    assert.equal(exceptions.data.items[0].requestId, requestId);
    const work = { actionType: "LOG_WORK", requestId, sessionId, reason: "联调跟进", minutesSpent: 3 };
    assert.equal((await post(work, undefined, userToken)).status, 403);
    assert.equal((await post(work, `b6:${requestId}:foreign`, foreignToken)).status, 404);
    const writes = await Promise.all(Array.from({ length: 10 }, () => post(work)));
    assert.ok(writes.every((r) => r.status === 201));
    assert.equal(writes.filter((r) => r.headers.get("Idempotency-Replayed") === "true").length, 9);
    assert.equal((await post({ ...work, minutesSpent: 4 })).status, 409);
    assert.equal((await post({ ...work, sessionId: randomUUID() }, `b6:${requestId}:mismatch`)).status, 422);
    assert.equal((await post({ ...work, opsUserId: A }, `b6:${requestId}:forged`)).status, 400);
    assert.equal((await post({ ...work, minutesSpent: 0 }, `b6:${requestId}:zero`)).status, 400);
    assert.equal((await post({ actionType: "RECORD_COST", requestId, sessionId, reason: "实际支出", costType: "OTHER", amountCents: 250, incurredAt: stamp }, `b6:${requestId}:cost`)).status, 201);
    assert.equal((await post({ actionType: "RECORD_COST", requestId, reason: "非法", costType: "OTHER", amountCents: 1.5, incurredAt: stamp }, `b6:${requestId}:fraction`)).status, 400);
    const detail = await (await get(`/api/v1/ops/flows/${requestId}`)).json() as { data: { deliveryAttempts: unknown[];
      events: { status: { eventType: string }[]; domain: { actorUserId: string }[] }; operations: { workLogs: { opsUserId: string }[]; costs: unknown[] } } };
    assert.equal(detail.data.events.status.filter((r) => r.eventType === "B6_TRACE").length, 4);
    assert.equal(detail.data.deliveryAttempts.length, 1); assert.equal(detail.data.operations.workLogs.length, 2); assert.equal(detail.data.operations.costs.length, 2);
    assert.ok(detail.data.operations.workLogs.every((r) => r.opsUserId === opsId)); assert.equal(detail.data.events.domain.length, 2);
    const metric = await (await get(`/api/v1/ops/metrics?sourceChannel=${channel}&from=${from.toISOString()}&to=${to.toISOString()}`)).json() as { data: { unitCost: { totalAmountCents: number; opsMinutes: number } } };
    assert.equal(metric.data.unitCost.opsMinutes, 5); assert.equal(metric.data.unitCost.totalAmountCents, 850);
  } finally {
    await db.transaction(async (tx) => {
      const related = await tx.select({ id: s.invitations.id }).from(s.invitations).where(eq(s.invitations.requestId, requestId));
      const notifications = related.length ? await tx.select({ id: s.notificationOutbox.id }).from(s.notificationOutbox).where(inArray(s.notificationOutbox.aggregateId, related.map(({ id }) => id))) : [];
      if (notifications.length) await tx.delete(s.deliveryAttempts).where(inArray(s.deliveryAttempts.outboxId, notifications.map(({ id }) => id)));
      if (related.length) await tx.delete(s.notificationOutbox).where(inArray(s.notificationOutbox.aggregateId, related.map(({ id }) => id)));
      await tx.delete(s.domainEvents).where(eq(s.domainEvents.requestId, requestId));
      await tx.delete(s.statusEvents).where(sql`${s.statusEvents.aggregateId} in (${requestId}::uuid, ${sessionId}::uuid)
        or ${s.statusEvents.aggregateId} in (select id from session_members where session_id = ${sessionId})
        or ${s.statusEvents.aggregateId} in (select id from checkins where session_id = ${sessionId})
        or ${s.statusEvents.aggregateId} in (select id from reviews where session_id = ${sessionId})
        or ${s.statusEvents.aggregateId} in (select id from regroup_intents where session_id = ${sessionId})`);
      await tx.delete(s.idempotencyRecords).where(eq(s.idempotencyRecords.userId, opsId));
      for (const table of [s.opsWorkLogs, s.costItems, s.checkins, s.reviews, s.regroupIntents, s.sessionMembers]) await tx.delete(table).where(eq(table.sessionId, sessionId));
      await tx.delete(s.invitations).where(eq(s.invitations.requestId, requestId));
      await tx.delete(s.sessions).where(eq(s.sessions.id, sessionId));
      await tx.delete(s.matchRuns).where(eq(s.matchRuns.requestId, requestId));
      await tx.delete(s.requests).where(inArray(s.requests.id, [requestId, secondId]));
      await tx.delete(s.users).where(inArray(s.users.id, [opsId, foreignOps])); await tx.delete(s.schools).where(eq(s.schools.id, foreignSchool));
    });
  }
});
