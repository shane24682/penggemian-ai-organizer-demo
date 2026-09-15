import "dotenv/config";

import assert from "node:assert/strict";
import test, { after } from "node:test";

import { and, count, eq, inArray, or } from "drizzle-orm";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import {
  requestRoleSlots,
  requests,
  schools,
  domainEvents,
  invitations,
  matchCandidates,
  matchRuns,
  notificationOutbox,
  sessionMembers,
  sessions,
  statusEvents,
  userAvailability,
  userCapabilities,
  users,
} from "../src/db/schema/index.js";

const config = loadConfig();
const connection = createDatabase(config.databaseUrl, 2);
const app = createApp(config, connection);

after(async () => {
  await connection.close();
});

const jsonRequest = (body: unknown, token?: string) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

const cleanupRequestFormation = async (requestId: string) => {
  const sessionRows = await connection.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.requestId, requestId));
  const sessionIds = sessionRows.map(({ id }) => id);
  const invitationRows = await connection.db
    .select({ id: invitations.id })
    .from(invitations)
    .where(eq(invitations.requestId, requestId));
  const invitationIds = invitationRows.map(({ id }) => id);

  if (invitationIds.length) {
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
  } finally {
    await connection.db.delete(requestRoleSlots).where(eq(requestRoleSlots.requestId, requestId));
    await connection.db.delete(requests).where(eq(requests.id, requestId));
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
    ),
  );
  assert.equal(response.status, 400);
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
      headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
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
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT" }),
      });
      assert.equal(response.status, 200);
    }

    const repeatedAccept = await app.request(`/api/v1/invitations/${listD.data[0].id}/respond`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenD}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACCEPT" }),
    });
    assert.equal(repeatedAccept.status, 200);

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
