import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { and, count, eq, inArray, or } from "drizzle-orm";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import {
  deliveryAttempts,
  checkins,
  costItems,
  idempotencyRecords,
  requestRoleSlots,
  requests,
  schools,

  domainEvents,
  invitations,
  matchCandidates,
  matchRuns,
  notificationOutbox,
  opsWorkLogs,

  sessionMembers,
  sessions,
  statusEvents,
  userAvailability,
  userCapabilities,
  users,
} from "../src/db/schema/index.js";
import { processNotificationOutbox } from "../src/notifications/service.js";

const config = loadConfig();
const connection = createDatabase(config.databaseUrl, 2);
const app = createApp(config, connection);

after(async () => {
  await connection.close();
});

const jsonRequest = (body: unknown, token?: string, idempotencyKey?: string) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  },
  body: JSON.stringify(body),
});

const login = async (phoneE164: string) => {
  const response = await app.request(
    "/api/v1/auth/login",
    jsonRequest({ phoneE164, password: "PenggemianTest!2026" }),
  );
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { data: { accessToken: string } };
  return payload.data.accessToken;
};

const createSingleCodingSlotRequest = async (token: string, title: string) => {
  const startsAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const response = await app.request(
    "/api/v1/requests",
    jsonRequest(
      {
        competitionName: "全国大学生数学建模竞赛",
        title,
        description: "B3 并发与通知可靠性集成测试",
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        weeklyHoursRequired: 8,
        participantLimit: 2,
        applicationDeadline: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        sourceChannel: "DIRECT",
        roleSlots: [{ roleCode: "CODING", slotCount: 1, minLevel: 3, evidenceRequired: true }],
      },
      token,
      `single-slot-${randomUUID()}`,
    ),
  );
  assert.equal(response.status, 201);
  const payload = (await response.json()) as { data: { id: string } };
  return payload.data.id;
};

const deleteCreatedRequest = async (requestId: string) => {
  await cleanupRequestFormation(requestId);
  await connection.db.delete(requestRoleSlots).where(eq(requestRoleSlots.requestId, requestId));
  await connection.db.delete(requests).where(eq(requests.id, requestId));
};

const cleanupRequestFormation = async (requestId: string) => {
  const sessionRows = await connection.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.requestId, requestId));
  const sessionIds = sessionRows.map(({ id }) => id);
  const invitationRows = await connection.db
    .select({ id: invitations.id })
    .from(invitations)
    .where(eq(invitations.requestId, requestId));
  const invitationIds = invitationRows.map(({ id }) => id);

  if (invitationIds.length) {
    const outboxRows = await connection.db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(inArray(notificationOutbox.aggregateId, invitationIds));
    if (outboxRows.length) {
      await connection.db
        .delete(deliveryAttempts)
        .where(inArray(deliveryAttempts.outboxId, outboxRows.map(({ id }) => id)));
    }
    await connection.db.delete(notificationOutbox).where(inArray(notificationOutbox.aggregateId, invitationIds));
  }
  await connection.db.delete(domainEvents).where(eq(domainEvents.requestId, requestId));
  const aggregateIds = [requestId, ...sessionIds, ...invitationIds];
  await connection.db.delete(statusEvents).where(inArray(statusEvents.aggregateId, aggregateIds));
  await connection.db.delete(invitations).where(eq(invitations.requestId, requestId));
  if (sessionIds.length) {
    await connection.db.delete(sessionMembers).where(inArray(sessionMembers.sessionId, sessionIds));
    await connection.db.delete(sessions).where(inArray(sessions.id, sessionIds));
  }
  await connection.db.delete(matchRuns).where(eq(matchRuns.requestId, requestId));
  await connection.db.update(requests).set({ status: "OPEN", updatedAt: new Date() }).where(eq(requests.id, requestId));
};

const createRequestBody = (startsAt: Date, title: string) => ({
  competitionName: "全国大学生数学建模竞赛",
  title,
  description: "数据库业务限制集成测试",
  startsAt: startsAt.toISOString(),
  endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  weeklyHoursRequired: 8,
  participantLimit: 3,
  applicationDeadline: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000).toISOString(),
  sourceChannel: "DIRECT",
  roleSlots: [
    { roleCode: "CODING", slotCount: 1, minLevel: 3, evidenceRequired: true },
    { roleCode: "WRITING", slotCount: 1, minLevel: 3, evidenceRequired: true },
  ],
});

const deleteCreatedRequests = async (requestIds: string[], idempotencyKeys: string[]) => {
  if (requestIds.length) {
    await connection.db.delete(domainEvents).where(inArray(domainEvents.requestId, requestIds));
    await connection.db.delete(statusEvents).where(inArray(statusEvents.aggregateId, requestIds));
    await connection.db.delete(requestRoleSlots).where(inArray(requestRoleSlots.requestId, requestIds));
    await connection.db.delete(requests).where(inArray(requests.id, requestIds));
  }
  if (idempotencyKeys.length) {
    await connection.db.delete(idempotencyRecords).where(inArray(idempotencyRecords.idempotencyKey, idempotencyKeys));
  }
};

test("seed creates the fixed school, users, availability, capabilities and request", async () => {
  const [schoolCount] = await connection.db.select({ value: count() }).from(schools);
  const [userCount] = await connection.db.select({ value: count() }).from(users);
  const [availabilityCount] = await connection.db.select({ value: count() }).from(userAvailability);
  const [capabilityCount] = await connection.db.select({ value: count() }).from(userCapabilities);
  const [requestCount] = await connection.db.select({ value: count() }).from(requests);

  assert.equal(schoolCount.value, 1);
  assert.equal(userCount.value, 4);
  assert.equal(availabilityCount.value, 4);
  assert.equal(capabilityCount.value, 4);
  assert.equal(requestCount.value >= 1, true);
});

test("database rejects an invalid availability window", async () => {
  await assert.rejects(() =>
    connection.db.insert(userAvailability).values({
      userId: "20000000-0000-4000-8000-000000000001",
      startsAt: new Date("2026-09-20T12:00:00Z"),
      endsAt: new Date("2026-09-20T11:00:00Z"),
    }),
  );
});

test("a real account can publish and reload its request while another user cannot view it", async () => {
  const tokenA = await login("+8613800000001");
  const tokenB = await login("+8613800000002");
  const startsAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const applicationDeadline = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);

  const createResponse = await app.request(
    "/api/v1/requests",
    jsonRequest(
      {
        competitionName: "全国大学生数学建模竞赛",
        title: "API集成测试需求",
        description: "数据库真实写入测试",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        weeklyHoursRequired: 8,
        participantLimit: 3,
        applicationDeadline: applicationDeadline.toISOString(),
        sourceChannel: "DIRECT",
        roleSlots: [
          { roleCode: "CODING", slotCount: 1, minLevel: 3, evidenceRequired: true },
          { roleCode: "WRITING", slotCount: 1, minLevel: 3, evidenceRequired: true },
        ],
      },
      tokenA,
      "integration-create-reload",
    ),
  );
  assert.equal(createResponse.status, 201);
  const createdPayload = (await createResponse.json()) as { data: { id: string; roleSlots: unknown[] } };
  const requestId = createdPayload.data.id;
  assert.equal(createdPayload.data.roleSlots.length, 2);

  try {
    const ownResponse = await app.request(`/api/v1/requests/${requestId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(ownResponse.status, 200);
    const ownPayload = (await ownResponse.json()) as { data: { id: string; roleSlots: unknown[] } };
    assert.equal(ownPayload.data.id, requestId);
    assert.equal(ownPayload.data.roleSlots.length, 2);

    const otherResponse = await app.request(`/api/v1/requests/${requestId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(otherResponse.status, 404);

    const [stored] = await connection.db
      .select({ id: requests.id })
      .from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.creatorUserId, "20000000-0000-4000-8000-000000000001")));
    assert.equal(stored.id, requestId);
    const [openedStatusEvent] = await connection.db
      .select()
      .from(statusEvents)
      .where(and(eq(statusEvents.aggregateId, requestId), eq(statusEvents.eventType, "REQUEST_OPENED")));
    const [openedDomainEvent] = await connection.db
      .select()
      .from(domainEvents)
      .where(and(eq(domainEvents.requestId, requestId), eq(domainEvents.eventType, "REQUEST_OPENED")));
    assert.equal(openedStatusEvent.toStatus, "OPEN");
    assert.equal(openedDomainEvent.dataScope, "TEST");
  } finally {
    await connection.db.delete(domainEvents).where(eq(domainEvents.requestId, requestId));
    await connection.db.delete(statusEvents).where(eq(statusEvents.aggregateId, requestId));
    await connection.db.delete(requestRoleSlots).where(eq(requestRoleSlots.requestId, requestId));
    await connection.db.delete(requests).where(eq(requests.id, requestId));
    await connection.db
      .delete(idempotencyRecords)
      .where(eq(idempotencyRecords.idempotencyKey, "integration-create-reload"));
  }
});

test("request validation rejects a participant count that does not match role slots", async () => {
  const tokenA = await login("+8613800000001");
  const startsAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const response = await app.request(
    "/api/v1/requests",
    jsonRequest(
      {
        competitionName: "全国大学生数学建模竞赛",
        title: "错误人数需求",
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        weeklyHoursRequired: 8,
        participantLimit: 3,
        applicationDeadline: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        roleSlots: [{ roleCode: "CODING", slotCount: 1, minLevel: 3 }],
      },
      tokenA,
      "integration-invalid-participant-limit",
    ),
  );
  assert.equal(response.status, 400);
});

test("request creation requires an idempotency key", async () => {
  const tokenB = await login("+8613800000002");
  const startsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const response = await app.request(
    "/api/v1/requests",
    jsonRequest(createRequestBody(startsAt, "缺少幂等键"), tokenB),
  );
  assert.equal(response.status, 400);
  const payload = (await response.json()) as { error: { code: string } };
  assert.equal(payload.error.code, "IDEMPOTENCY_KEY_REQUIRED");
});

test("concurrent retries with one idempotency key create exactly one request", async () => {
  const tokenB = await login("+8613800000002");
  const startsAt = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000);
  const body = createRequestBody(startsAt, "并发幂等需求");
  const key = "integration-idempotent-create";
  const requestIds: string[] = [];

  try {
    const responses = await Promise.all([
      app.request("/api/v1/requests", jsonRequest(body, tokenB, key)),
      app.request("/api/v1/requests", jsonRequest(body, tokenB, key)),
    ]);
    assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 201]);
    const payloads = await Promise.all(
      responses.map((response) => response.json() as Promise<{ data: { id: string } }>),
    );
    assert.equal(payloads[0].data.id, payloads[1].data.id);
    requestIds.push(payloads[0].data.id);

    const [storedCount] = await connection.db
      .select({ value: count() })
      .from(requests)
      .where(eq(requests.id, payloads[0].data.id));
    assert.equal(storedCount.value, 1);

    const changedBody = { ...body, title: "复用幂等键的另一份需求" };
    const conflict = await app.request(
      "/api/v1/requests",
      jsonRequest(changedBody, tokenB, key),
    );
    assert.equal(conflict.status, 409);
    const conflictPayload = (await conflict.json()) as { error: { code: string } };
    assert.equal(conflictPayload.error.code, "IDEMPOTENCY_KEY_REUSED");
  } finally {
    await deleteCreatedRequests(requestIds, [key]);
  }
});

test("active duplicate and overlapping creator requests are rejected", async () => {
  const tokenC = await login("+8613800000003");
  const startsAt = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
  const body = createRequestBody(startsAt, "时间边界基准需求");
  const keys = ["integration-time-base", "integration-time-duplicate", "integration-time-overlap"];
  const requestIds: string[] = [];

  try {
    const created = await app.request(
      "/api/v1/requests",
      jsonRequest(body, tokenC, keys[0]),
    );
    assert.equal(created.status, 201);
    const createdPayload = (await created.json()) as { data: { id: string } };
    requestIds.push(createdPayload.data.id);

    const duplicate = await app.request(
      "/api/v1/requests",
      jsonRequest(body, tokenC, keys[1]),
    );
    assert.equal(duplicate.status, 409);
    const duplicatePayload = (await duplicate.json()) as { error: { code: string } };
    assert.equal(duplicatePayload.error.code, "DUPLICATE_ACTIVE_REQUEST");

    const overlappingStart = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const overlap = await app.request(
      "/api/v1/requests",
      jsonRequest(createRequestBody(overlappingStart, "重叠时间需求"), tokenC, keys[2]),
    );
    assert.equal(overlap.status, 409);
    const overlapPayload = (await overlap.json()) as { error: { code: string } };
    assert.equal(overlapPayload.error.code, "REQUEST_TIME_CONFLICT");
  } finally {
    await deleteCreatedRequests(requestIds, keys);
  }
});

test("a creator cannot keep more than three active requests", async () => {
  const tokenD = await login("+8613800000004");
  const baseTime = Date.now() + 14 * 24 * 60 * 60 * 1000;
  const keys = [
    "integration-active-limit-1",
    "integration-active-limit-2",
    "integration-active-limit-3",
    "integration-active-limit-4",
  ];
  const requestIds: string[] = [];

  try {
    for (let index = 0; index < 3; index += 1) {
      const startsAt = new Date(baseTime + index * 24 * 60 * 60 * 1000);
      const response = await app.request(
        "/api/v1/requests",
        jsonRequest(createRequestBody(startsAt, `活动需求 ${index + 1}`), tokenD, keys[index]),
      );
      assert.equal(response.status, 201);
      const payload = (await response.json()) as { data: { id: string } };
      requestIds.push(payload.data.id);
    }

    const fourthStart = new Date(baseTime + 4 * 24 * 60 * 60 * 1000);
    const fourth = await app.request(
      "/api/v1/requests",
      jsonRequest(createRequestBody(fourthStart, "活动需求 4"), tokenD, keys[3]),
    );
    assert.equal(fourth.status, 409);
    const fourthPayload = (await fourth.json()) as { error: { code: string } };
    assert.equal(fourthPayload.error.code, "ACTIVE_REQUEST_LIMIT_REACHED");
  } finally {
    await deleteCreatedRequests(requestIds, keys);
  }
});

test("matching reads seeded users and persists a reloadable current run", async () => {
  const requestId = "30000000-0000-4000-8000-000000000001";
  const tokenA = await login("+8613800000001");
  await cleanupRequestFormation(requestId);

  try {
    const matchResponse = await app.request(`/api/v1/requests/${requestId}/match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(matchResponse.status, 200);
    const matchPayload = (await matchResponse.json()) as {
      data: { runId: string; readyForInvitationDispatch: boolean; candidates: Array<{ candidate: { displayName: string } }> };
    };
    assert.equal(matchPayload.data.readyForInvitationDispatch, true);
    assert.deepEqual(
      new Set(matchPayload.data.candidates.map((item) => item.candidate.displayName)),
      new Set(["测试主选B", "测试候补D", "测试主选C"]),
    );

    const currentResponse = await app.request(`/api/v1/requests/${requestId}/matches/current`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(currentResponse.status, 200);
    const currentPayload = (await currentResponse.json()) as {
      data: { id: string; isCurrent: boolean; candidateCount: number; candidates: Array<{ displayName: string }> };
    };
    assert.equal(currentPayload.data.id, matchPayload.data.runId);
    assert.equal(currentPayload.data.isCurrent, true);
    assert.equal(currentPayload.data.candidateCount, 3);
    assert.equal(currentPayload.data.candidates.length, 3);

    const [storedCandidate] = await connection.db
      .select({ id: matchCandidates.id })
      .from(matchCandidates)
      .where(eq(matchCandidates.matchRunId, matchPayload.data.runId))
      .limit(1);
    assert.ok(storedCandidate.id);
  } finally {
    await cleanupRequestFormation(requestId);
  }
});

test("matching excludes a candidate who already has an overlapping confirmed session", async () => {
  const requestId = "30000000-0000-4000-8000-000000000001";
  const tokenA = await login("+8613800000001");
  const [seededRequest] = await connection.db.select().from(requests).where(eq(requests.id, requestId));
  assert.ok(seededRequest);
  const [blockingRequest] = await connection.db
    .insert(requests)
    .values({
      schoolId: seededRequest.schoolId,
      creatorUserId: seededRequest.creatorUserId,
      competitionName: "时间冲突测试",
      title: "B 已确认参加的重叠项目",
      startsAt: seededRequest.startsAt,
      endsAt: seededRequest.endsAt,
      weeklyHoursRequired: 1,
      participantLimit: 2,
      applicationDeadline: seededRequest.applicationDeadline,
      dataScope: "TEST",
    })
    .returning();
  const [blockingSlot] = await connection.db
    .insert(requestRoleSlots)
    .values({ requestId: blockingRequest.id, roleCode: "CODING", slotCount: 1, minLevel: 1 })
    .returning();
  const [blockingSession] = await connection.db
    .insert(sessions)
    .values({
      requestId: blockingRequest.id,
      schoolId: blockingRequest.schoolId,
      status: "CONFIRMED",
      startsAt: blockingRequest.startsAt,
      endsAt: blockingRequest.endsAt,
    })
    .returning();
  await connection.db.insert(sessionMembers).values([
    { sessionId: blockingSession.id, userId: seededRequest.creatorUserId, memberType: "HOST" },
    {
      sessionId: blockingSession.id,
      userId: "20000000-0000-4000-8000-000000000002",
      roleSlotId: blockingSlot.id,
      memberType: "PARTICIPANT",
    },
  ]);
  await cleanupRequestFormation(requestId);

  try {
    const response = await app.request(`/api/v1/requests/${requestId}/match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: { readyForInvitationDispatch: boolean; candidates: Array<{ candidate: { userId: string } }> };
    };
    assert.equal(payload.data.readyForInvitationDispatch, true);
    assert.equal(
      payload.data.candidates.some(({ candidate }) => candidate.userId === "20000000-0000-4000-8000-000000000002"),
      false,
    );
    assert.deepEqual(
      new Set(payload.data.candidates.map(({ candidate }) => candidate.userId)),
      new Set(["20000000-0000-4000-8000-000000000003", "20000000-0000-4000-8000-000000000004"]),
    );
  } finally {
    await cleanupRequestFormation(requestId);
    await cleanupRequestFormation(blockingRequest.id);
    await connection.db.delete(requestRoleSlots).where(eq(requestRoleSlots.requestId, blockingRequest.id));
    await connection.db.delete(requests).where(eq(requests.id, blockingRequest.id));
  }
});

test("the creator can cancel an inviting request and its active lifecycle records", async () => {
  const requestId = "30000000-0000-4000-8000-000000000001";
  const [tokenA, tokenB] = await Promise.all([login("+8613800000001"), login("+8613800000002")]);
  await cleanupRequestFormation(requestId);

  try {
    const matchResponse = await app.request(`/api/v1/requests/${requestId}/match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(matchResponse.status, 200);

    const hiddenCancel = await app.request(`/api/v1/requests/${requestId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(hiddenCancel.status, 404);

    const cancelResponse = await app.request(`/api/v1/requests/${requestId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(cancelResponse.status, 200);
    const repeatedCancel = await app.request(`/api/v1/requests/${requestId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(repeatedCancel.status, 200);

    const [storedRequest] = await connection.db.select().from(requests).where(eq(requests.id, requestId));
    const [storedSession] = await connection.db.select().from(sessions).where(eq(sessions.requestId, requestId));
    const storedInvitations = await connection.db.select().from(invitations).where(eq(invitations.requestId, requestId));
    const cancellationEvents = await connection.db
      .select({ eventType: statusEvents.eventType })
      .from(statusEvents)
      .where(inArray(statusEvents.aggregateId, [requestId, storedSession.id, ...storedInvitations.map(({ id }) => id)]));
    const invitationNotifications = await connection.db
      .select({ templateCode: notificationOutbox.templateCode, status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(inArray(notificationOutbox.aggregateId, storedInvitations.map(({ id }) => id)));
    assert.equal(storedRequest.status, "CANCELLED");
    assert.equal(storedSession.status, "CANCELLED");
    assert.ok(storedInvitations.every(({ status }) => status === "CANCELLED"));
    assert.equal(cancellationEvents.filter(({ eventType }) => eventType === "REQUEST_CANCELLED").length, 1);
    assert.ok(cancellationEvents.some(({ eventType }) => eventType === "SESSION_CANCELLED_WITH_REQUEST"));
    assert.ok(
      invitationNotifications
        .filter(({ templateCode }) => templateCode === "TEAM_INVITATION_PENDING")
        .every(({ status }) => status === "DEAD"),
    );
    assert.ok(
      invitationNotifications.some(
        ({ templateCode, status }) => templateCode === "TEAM_INVITATION_CANCELLED" && status === "QUEUED",
      ),
    );
  } finally {
    await cleanupRequestFormation(requestId);
  }
});

test("ops can list a filtered flow and reconstruct its complete database trail", async () => {
  const requestId = "30000000-0000-4000-8000-000000000001";
  const userAId = "20000000-0000-4000-8000-000000000001";
  await cleanupRequestFormation(requestId);
  await connection.db.update(users).set({ role: "OPS", updatedAt: new Date() }).where(eq(users.id, userAId));
  const [tokenOps, tokenUser] = await Promise.all([login("+8613800000001"), login("+8613800000002")]);

  try {
    const matchResponse = await app.request(`/api/v1/requests/${requestId}/match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOps}` },
    });
    assert.equal(matchResponse.status, 200);

    const forbidden = await app.request("/api/v1/ops/flows", {
      headers: { Authorization: `Bearer ${tokenUser}` },
    });
    assert.equal(forbidden.status, 403);

    const listResponse = await app.request(
      "/api/v1/ops/flows?sceneCode=MATH_MODELING&sourceChannel=DIRECT&status=INVITING&dataScope=TEST&limit=10",
      { headers: { Authorization: `Bearer ${tokenOps}` } },
    );
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as {
      data: {
        items: Array<{
          requestId: string;
          requestStatus: string;
          counts: { candidates: number; invitations: number; members: number };
        }>;
      };
    };
    const flow = listPayload.data.items.find((item) => item.requestId === requestId);
    assert.ok(flow);
    assert.equal(flow.requestStatus, "INVITING");
    assert.deepEqual(flow.counts, {
      candidates: 3,
      invitations: 3,
      pendingInvitations: 2,
      acceptedInvitations: 0,
      members: 1,
      checkedIn: 0,
      failedNotifications: 0,
    });

    const detailResponse = await app.request(`/api/v1/ops/flows/${requestId}`, {
      headers: { Authorization: `Bearer ${tokenOps}` },
    });
    assert.equal(detailResponse.status, 200);
    const detailPayload = (await detailResponse.json()) as {
      data: {
        request: { id: string };
        matching: { runs: unknown[]; candidates: unknown[] };
        session: { members: unknown[] };
        invitations: unknown[];
        notifications: unknown[];
        events: { status: unknown[]; domain: unknown[] };
      };
    };
    assert.equal(detailPayload.data.request.id, requestId);
    assert.equal(detailPayload.data.matching.runs.length, 1);
    assert.equal(detailPayload.data.matching.candidates.length, 3);
    assert.equal(detailPayload.data.session.members.length, 1);
    assert.equal(detailPayload.data.invitations.length, 3);
    assert.equal(detailPayload.data.notifications.length, 2);
    assert.ok(detailPayload.data.events.status.length >= 2);
    assert.ok(detailPayload.data.events.domain.length >= 1);
  } finally {
    await cleanupRequestFormation(requestId);
    await connection.db.update(users).set({ role: "USER", updatedAt: new Date() }).where(eq(users.id, userAId));
  }
});

test("real invitations decline, promote a backup, accept, and confirm one session", async () => {
  const requestId = "30000000-0000-4000-8000-000000000001";
  const [tokenA, tokenB, tokenC, tokenD] = await Promise.all([
    login("+8613800000001"),
    login("+8613800000002"),
    login("+8613800000003"),
    login("+8613800000004"),
  ]);
  await cleanupRequestFormation(requestId);

  try {
    const matchResponse = await app.request(`/api/v1/requests/${requestId}/match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(matchResponse.status, 200);
    const matchPayload = (await matchResponse.json()) as {
      data: { sessionId: string; invitationCount: number };
    };
    assert.ok(matchPayload.data.sessionId);
    assert.equal(matchPayload.data.invitationCount, 3);

    const loadInvitations = async (token: string) => {
      const response = await app.request("/api/v1/me/invitations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 200);
      return (await response.json()) as {
        data: Array<{ id: string; status: string; candidateType: string; roleSlotId: string }>;
      };
    };
    const [listB, listC, listD] = await Promise.all([
      loadInvitations(tokenB),
      loadInvitations(tokenC),
      loadInvitations(tokenD),
    ]);
    assert.equal(listB.data[0].status, "PENDING");
    assert.equal(listC.data[0].status, "PENDING");
    assert.equal(listD.data[0].status, "QUEUED");

    const hiddenResponse = await app.request(`/api/v1/invitations/${listB.data[0].id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(hiddenResponse.status, 404);

    const declineResponse = await app.request(`/api/v1/invitations/${listB.data[0].id}/respond`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenB}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `test:${listB.data[0].id}:decline`,
      },
      body: JSON.stringify({ action: "DECLINE" }),
    });
    assert.equal(declineResponse.status, 200);
    const declinePayload = (await declineResponse.json()) as { data: { promotedInvitationId: string } };
    assert.equal(declinePayload.data.promotedInvitationId, listD.data[0].id);
    assert.equal((await loadInvitations(tokenD)).data[0].status, "PENDING");

    for (const [invitationId, token] of [
      [listC.data[0].id, tokenC],
      [listD.data[0].id, tokenD],
    ] as const) {
      const response = await app.request(`/api/v1/invitations/${invitationId}/respond`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `test:${invitationId}:accept`,
        },
        body: JSON.stringify({ action: "ACCEPT" }),
      });
      assert.equal(response.status, 200);
    }

    const repeatedAccept = await app.request(`/api/v1/invitations/${listD.data[0].id}/respond`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenD}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `test:${listD.data[0].id}:accept`,
      },
      body: JSON.stringify({ action: "ACCEPT" }),
    });
    assert.equal(repeatedAccept.status, 200);
    assert.equal(repeatedAccept.headers.get("Idempotency-Replayed"), "true");

    const reusedKey = await app.request(`/api/v1/invitations/${listD.data[0].id}/respond`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenD}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `test:${listD.data[0].id}:accept`,
      },
      body: JSON.stringify({ action: "DECLINE" }),
    });
    assert.equal(reusedKey.status, 409);

    const sessionResponse = await app.request(`/api/v1/sessions/${matchPayload.data.sessionId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(sessionResponse.status, 200);
    const sessionPayload = (await sessionResponse.json()) as {
      data: { status: string; members: Array<{ userId: string }> };
    };
    assert.equal(sessionPayload.data.status, "CONFIRMED");
    assert.equal(sessionPayload.data.members.length, 3);

    const declinedUserSession = await app.request(`/api/v1/sessions/${matchPayload.data.sessionId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(declinedUserSession.status, 404);

    const [sessionCount] = await connection.db.select({ value: count() }).from(sessions).where(eq(sessions.requestId, requestId));
    const [memberCount] = await connection.db
      .select({ value: count() })
      .from(sessionMembers)
      .where(eq(sessionMembers.sessionId, matchPayload.data.sessionId));
    const eventRows = await connection.db
      .select({ eventType: statusEvents.eventType })
      .from(statusEvents)
      .where(
        or(
          eq(statusEvents.aggregateId, requestId),
          eq(statusEvents.aggregateId, matchPayload.data.sessionId),
          inArray(statusEvents.aggregateId, [listB.data[0].id, listC.data[0].id, listD.data[0].id]),
        ),
      );
    assert.equal(sessionCount.value, 1);
    assert.equal(memberCount.value, 3);
    assert.ok(eventRows.some(({ eventType }) => eventType === "BACKUP_PROMOTED"));
    assert.ok(eventRows.some(({ eventType }) => eventType === "SESSION_CONFIRMED"));
  } finally {
    await cleanupRequestFormation(requestId);
  }
});

test("two candidates racing for the last slot cannot overfill or create duplicate sessions", async () => {
  const [tokenA, tokenB, tokenD] = await Promise.all([
    login("+8613800000001"),
    login("+8613800000002"),
    login("+8613800000004"),
  ]);
  const requestId = await createSingleCodingSlotRequest(tokenA, "B3 最后一席并发接受测试");

  try {
    const matchResponse = await app.request(`/api/v1/requests/${requestId}/match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(matchResponse.status, 200);
    const matchPayload = (await matchResponse.json()) as { data: { sessionId: string } };

    const invitationRows = await connection.db
      .select({ id: invitations.id, inviteeUserId: invitations.inviteeUserId, status: invitations.status })
      .from(invitations)
      .where(eq(invitations.requestId, requestId));
    assert.equal(invitationRows.length, 2);
    assert.deepEqual(new Set(invitationRows.map(({ status }) => status)), new Set(["PENDING", "QUEUED"]));

    const queued = invitationRows.find(({ status }) => status === "QUEUED");
    assert.ok(queued);
    const promotedAt = new Date();
    await connection.db
      .update(invitations)
      .set({
        status: "PENDING",
        sentAt: promotedAt,
        expiresAt: new Date(promotedAt.getTime() + 24 * 60 * 60 * 1000),
        updatedAt: promotedAt,
      })
      .where(eq(invitations.id, queued.id));

    const tokenByUserId = new Map([
      ["20000000-0000-4000-8000-000000000002", tokenB],
      ["20000000-0000-4000-8000-000000000004", tokenD],
    ]);
    const responses = await Promise.all(
      invitationRows.map((invitation) =>
        app.request(`/api/v1/invitations/${invitation.id}/respond`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenByUserId.get(invitation.inviteeUserId)}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `b3-race:${requestId}:${invitation.id}`,
          },
          body: JSON.stringify({ action: "ACCEPT" }),
        }),
      ),
    );
    assert.deepEqual(
      responses.map(({ status }) => status).sort((left, right) => left - right),
      [200, 409],
    );

    const winnerIndex = responses.findIndex(({ status }) => status === 200);
    const winner = invitationRows[winnerIndex];
    assert.ok(winner);
    const winnerToken = tokenByUserId.get(winner.inviteeUserId);
    assert.ok(winnerToken);
    const repeated = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.request(`/api/v1/invitations/${winner.id}/respond`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${winnerToken}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `b3-race:${requestId}:${winner.id}`,
          },
          body: JSON.stringify({ action: "ACCEPT" }),
        }),
      ),
    );
    assert.ok(repeated.every((response) => response.status === 200));
    assert.ok(repeated.every((response) => response.headers.get("Idempotency-Replayed") === "true"));

    const [sessionCount] = await connection.db.select({ value: count() }).from(sessions).where(eq(sessions.requestId, requestId));
    const [memberCount] = await connection.db
      .select({ value: count() })
      .from(sessionMembers)
      .where(eq(sessionMembers.sessionId, matchPayload.data.sessionId));
    const acceptedRows = await connection.db
      .select({ id: invitations.id })
      .from(invitations)
      .where(and(eq(invitations.requestId, requestId), eq(invitations.status, "ACCEPTED")));
    assert.equal(sessionCount.value, 1);
    assert.equal(memberCount.value, 2);
    assert.equal(acceptedRows.length, 1);
    const requestOutboxRows = await connection.db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(inArray(notificationOutbox.aggregateId, invitationRows.map(({ id }) => id)));
    assert.equal(requestOutboxRows.length, 1);
  } finally {
    await deleteCreatedRequest(requestId);
  }
});

test("notification outbox records bounded failures and stops after three attempts", async () => {
  const tokenA = await login("+8613800000001");
  const requestId = await createSingleCodingSlotRequest(tokenA, "B3 通知重试测试");

  try {
    const matchResponse = await app.request(`/api/v1/requests/${requestId}/match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(matchResponse.status, 200);

    const requestInvitationIds = new Set(
      (await connection.db.select({ id: invitations.id }).from(invitations).where(eq(invitations.requestId, requestId))).map(
        ({ id }) => id,
      ),
    );
    const requestOutboxRows = await connection.db
      .select()
      .from(notificationOutbox)
      .where(inArray(notificationOutbox.aggregateId, [...requestInvitationIds]));
    assert.equal(requestOutboxRows.length, 1);
    const target = requestOutboxRows[0];
    assert.ok(target);

    const fail = async () => {
      throw new Error("forced delivery failure");
    };
    const firstAt = new Date(Math.max(Date.now(), target.availableAt.getTime()));
    const first = await processNotificationOutbox(connection.db, fail, firstAt);
    const secondAt = new Date(firstAt.getTime() + 60_001);
    const second = await processNotificationOutbox(connection.db, fail, secondAt);
    const thirdAt = new Date(secondAt.getTime() + 5 * 60_000 + 1);
    const third = await processNotificationOutbox(connection.db, fail, thirdAt);
    assert.deepEqual(first, [{ outboxId: target.id, status: "FAILED" }]);
    assert.deepEqual(second, [{ outboxId: target.id, status: "FAILED" }]);
    assert.deepEqual(third, [{ outboxId: target.id, status: "DEAD" }]);

    const [stored] = await connection.db.select().from(notificationOutbox).where(eq(notificationOutbox.id, target.id));
    const attemptRows = await connection.db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.outboxId, target.id));
    assert.equal(stored.status, "DEAD");
    assert.equal(stored.attemptCount, 3);
    assert.equal(attemptRows.length, 3);
    assert.ok(attemptRows.every(({ status, errorDetail }) => status === "FAILED" && errorDetail === "forced delivery failure"));

    const noFourthAttempt = await processNotificationOutbox(
      connection.db,
      fail,
      new Date(thirdAt.getTime() + 24 * 60 * 60 * 1000),
    );
    assert.deepEqual(noFourthAttempt, []);
  } finally {
    await deleteCreatedRequest(requestId);
  }
});

test("re-running notification delivery sends one in-app notification and supports read state", async () => {
  const [tokenA, tokenB, tokenD] = await Promise.all([
    login("+8613800000001"),
    login("+8613800000002"),
    login("+8613800000004"),
  ]);
  const requestId = await createSingleCodingSlotRequest(tokenA, "B3 通知去重测试");

  try {
    const matchResponse = await app.request(`/api/v1/requests/${requestId}/match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(matchResponse.status, 200);
    const invitationRows = await connection.db
      .select({ id: invitations.id })
      .from(invitations)
      .where(eq(invitations.requestId, requestId));
    const [target] = await connection.db
      .select()
      .from(notificationOutbox)
      .where(inArray(notificationOutbox.aggregateId, invitationRows.map(({ id }) => id)));
    assert.ok(target);

    let sendCount = 0;
    const sender = async () => {
      sendCount += 1;
    };
    // PostgreSQL defaults retain microseconds; JS Date truncates to milliseconds.
    const deliveryAt = new Date(target.availableAt.getTime() + 1);
    const firstRun = await processNotificationOutbox(connection.db, sender, deliveryAt);
    const repeatedRun = await processNotificationOutbox(connection.db, sender, new Date(target.availableAt.getTime() + 60_000));
    assert.deepEqual(firstRun, [{ outboxId: target.id, status: "SENT" }]);
    assert.deepEqual(repeatedRun, []);
    assert.equal(sendCount, 1);

    const recipientToken =
      target.recipientUserId === "20000000-0000-4000-8000-000000000002" ? tokenB : tokenD;
    const listResponse = await app.request("/api/v1/me/notifications", {
      headers: { Authorization: `Bearer ${recipientToken}` },
    });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as { data: Array<{ id: string; payload: Record<string, unknown> }> };
    const visible = listPayload.data.find(({ id }) => id === target.id);
    assert.ok(visible);
    assert.deepEqual(Object.keys(visible.payload).sort(), ["invitationId", "requestId", "sessionId"]);

    const readResponse = await app.request(`/api/v1/me/notifications/${target.id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${recipientToken}`, "Content-Type": "application/json" },
    });
    assert.equal(readResponse.status, 200);
    const [stored] = await connection.db.select().from(notificationOutbox).where(eq(notificationOutbox.id, target.id));
    assert.ok(stored.readAt);
  } finally {
    await deleteCreatedRequest(requestId);
  }
});

test("ops metrics use only REAL cohorts and return the four frozen calculations", async () => {
  const schoolId = "10000000-0000-4000-8000-000000000001";
  const userAId = "20000000-0000-4000-8000-000000000001";
  const userBId = "20000000-0000-4000-8000-000000000002";
  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000);
  const to = new Date(now.getTime() + 60 * 60 * 1000);
  const startsAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const applicationDeadline = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);

  await connection.db.update(users).set({ role: "OPS", updatedAt: now }).where(eq(users.id, userAId));
  const tokenOps = await login("+8613800000001");
  const tokenUser = await login("+8613800000002");
  const [request] = await connection.db
    .insert(requests)
    .values({
      schoolId,
      creatorUserId: userAId,
      competitionName: "指标测试竞赛",
      title: "真实指标测试需求",
      startsAt,
      endsAt,
      weeklyHoursRequired: 1,
      participantLimit: 2,
      applicationDeadline,
      status: "FULFILLED",
      sourceChannel: "DIRECT",
      dataScope: "REAL",
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
    })
    .returning();
  const [slot] = await connection.db
    .insert(requestRoleSlots)
    .values({ requestId: request.id, roleCode: "CODING", slotCount: 1, minLevel: 1 })
    .returning();
  const [session] = await connection.db
    .insert(sessions)
    .values({
      requestId: request.id,
      schoolId,
      status: "COMPLETED",
      startsAt,
      endsAt,
    })
    .returning();
  await connection.db.insert(sessionMembers).values([
    { sessionId: session.id, userId: userAId, memberType: "HOST", memberStatus: "COMPLETED" },
    {
      sessionId: session.id,
      userId: userBId,
      roleSlotId: slot.id,
      memberType: "PARTICIPANT",
      memberStatus: "COMPLETED",
    },
  ]);
  await connection.db.insert(checkins).values([
    { sessionId: session.id, userId: userAId, status: "PRESENT", checkedInAt: now },
    { sessionId: session.id, userId: userBId, status: "LATE", checkedInAt: now },
  ]);
  await connection.db.insert(statusEvents).values([
    {
      aggregateType: "REQUEST",
      aggregateId: request.id,
      eventType: "REQUEST_FULFILLED",
      fromStatus: "INVITING",
      toStatus: "FULFILLED",
      createdAt: now,
    },
    {
      aggregateType: "SESSION",
      aggregateId: session.id,
      eventType: "SESSION_CONFIRMED",
      fromStatus: "FORMING",
      toStatus: "CONFIRMED",
      createdAt: now,
    },
    {
      aggregateType: "SESSION",
      aggregateId: session.id,
      eventType: "SESSION_COMPLETED",
      fromStatus: "IN_PROGRESS",
      toStatus: "COMPLETED",
      createdAt: now,
    },
  ]);
  await connection.db.insert(costItems).values({
    schoolId,
    requestId: request.id,
    sessionId: session.id,
    costType: "VENUE",
    amountCents: 300,
    incurredAt: now,
  });
  await connection.db.insert(opsWorkLogs).values({
    opsUserId: userAId,
    requestId: request.id,
    sessionId: session.id,
    actionType: "FOLLOW_UP",
    minutesSpent: 2,
  });
  const [regroupRequest] = await connection.db
    .insert(requests)
    .values({
      schoolId,
      creatorUserId: userAId,
      competitionName: "指标测试竞赛",
      title: "七日内复组需求",
      startsAt: new Date(startsAt.getTime() + 14 * 24 * 60 * 60 * 1000),
      endsAt: new Date(endsAt.getTime() + 14 * 24 * 60 * 60 * 1000),
      weeklyHoursRequired: 1,
      participantLimit: 2,
      applicationDeadline: new Date(applicationDeadline.getTime() + 14 * 24 * 60 * 60 * 1000),
      sourceSessionId: session.id,
      sourceChannel: "DIRECT",
      dataScope: "REAL",
      createdAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    })
    .returning();

  try {
    const forbidden = await app.request(
      `/api/v1/ops/metrics?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      { headers: { Authorization: `Bearer ${tokenUser}` } },
    );
    assert.equal(forbidden.status, 403);

    const response = await app.request(
      `/api/v1/ops/metrics?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&sourceChannel=DIRECT`,
      { headers: { Authorization: `Bearer ${tokenOps}` } },
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      data: {
        filters: { dataScope: string; sourceChannel: string };
        formationRate: { numerator: number; denominator: number; rate: number };
        attendanceRate: { numerator: number; denominator: number; rate: number };
        regroupRate: { numerator: number; denominator: number; rate: number };
        unitCost: { totalAmountCents: number; completedSessions: number; amountCentsPerCompletedSession: number };
      };
    };
    assert.equal(payload.data.filters.dataScope, "REAL");
    assert.equal(payload.data.filters.sourceChannel, "DIRECT");
    assert.deepEqual(payload.data.formationRate, { numerator: 1, denominator: 1, rate: 1 });
    assert.deepEqual(payload.data.attendanceRate, { numerator: 2, denominator: 2, rate: 1 });
    assert.deepEqual(payload.data.regroupRate, { numerator: 1, denominator: 1, rate: 1 });
    assert.equal(payload.data.unitCost.totalAmountCents, 500);
    assert.equal(payload.data.unitCost.completedSessions, 1);
    assert.equal(payload.data.unitCost.amountCentsPerCompletedSession, 500);
  } finally {
    await connection.db.delete(costItems).where(eq(costItems.sessionId, session.id));
    await connection.db.delete(opsWorkLogs).where(eq(opsWorkLogs.sessionId, session.id));
    await connection.db.delete(checkins).where(eq(checkins.sessionId, session.id));
    await connection.db.delete(statusEvents).where(inArray(statusEvents.aggregateId, [request.id, session.id]));
    await connection.db.delete(sessionMembers).where(eq(sessionMembers.sessionId, session.id));
    await connection.db.delete(requests).where(eq(requests.id, regroupRequest.id));
    await connection.db.delete(sessions).where(eq(sessions.id, session.id));
    await connection.db.delete(requestRoleSlots).where(eq(requestRoleSlots.requestId, request.id));
    await connection.db.delete(requests).where(eq(requests.id, request.id));
    await connection.db.update(users).set({ role: "USER", updatedAt: new Date() }).where(eq(users.id, userAId));

  }
});
