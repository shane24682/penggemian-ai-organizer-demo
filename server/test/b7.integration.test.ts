import "dotenv/config";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDatabase } from "../src/db/client.js";
import * as s from "../src/db/schema/index.js";
import { expirePendingInvitations } from "../src/invitations/service.js";

const config = loadConfig();
if (config.appEnv !== "test") throw new Error("B7 integration requires an isolated TEST database");
const connection = createDatabase(config.databaseUrl, 4); const db = connection.db;
const app = createApp(config, connection); after(() => connection.close());
const B = "20000000-0000-4000-8000-000000000002"; const D = "20000000-0000-4000-8000-000000000004";
const login = async (index: number) => {
  const response = await app.request("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneE164: `+861380000000${index}`, password: "PenggemianTest!2026" }) });
  assert.equal(response.status, 200); return (await response.json() as { data: { accessToken: string } }).data.accessToken;
};
const post = (path: string, token: string, key: string, body: unknown) => app.request(path, { method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });
const scenario = async (race: boolean) => {
  const [a, b, d] = await Promise.all([login(1), login(2), login(4)]);
  let requestId = "";
  try {
    const start = new Date(Date.now() + 144 * 3600_000);
    const created = await post("/api/v1/requests", a, `b7-create-${Date.now()}`, { title: "B7 超时可靠递补", competitionName: "全国大学生数学建模竞赛",
      startsAt: start, endsAt: new Date(start.getTime() + 2 * 3600_000), applicationDeadline: new Date(start.getTime() - 24 * 3600_000),
      weeklyHoursRequired: 8, participantLimit: 2, roleSlots: [{ roleCode: "CODING", slotCount: 1, minLevel: 3, evidenceRequired: true }] });
    assert.equal(created.status, 201); requestId = (await created.json() as { data: { id: string } }).data.id;
    assert.equal((await post(`/api/v1/requests/${requestId}/match`, a, `b7:${requestId}:match`, {})).status, 200);
    const rows = await db.select().from(s.invitations).where(eq(s.invitations.requestId, requestId));
    const primary = rows.find((row) => row.inviteeUserId === B)!; const backup = rows.find((row) => row.inviteeUserId === D)!;
    assert.equal(primary.status, "PENDING"); assert.equal(backup.status, "QUEUED");
    const now = new Date();
    await db.update(s.invitations).set({ sentAt: new Date(now.getTime() - 24 * 3600_000), expiresAt: new Date(now.getTime() - 1000) }).where(eq(s.invitations.id, primary.id));
    if (race) {
      const [responses, jobs] = await Promise.all([
        Promise.all(Array.from({ length: 10 }, (_, i) => post(`/api/v1/invitations/${primary.id}/respond`, b, `b7:${requestId}:expired-${i}`, { action: "ACCEPT" }))),
        Promise.all(Array.from({ length: 3 }, () => expirePendingInvitations(db, now))),
      ]);
      assert.ok(responses.every((r) => r.status === 409)); assert.ok(jobs.flat().every((r) => r.success));
    } else {
      const result = await expirePendingInvitations(db, now); assert.ok(result.some((r) => r.invitationId === primary.id && r.success));
    }
    assert.equal((await expirePendingInvitations(db, now)).length, 0);
    const after = await db.select().from(s.invitations).where(eq(s.invitations.requestId, requestId));
    assert.equal(after.find((r) => r.id === primary.id)?.status, "EXPIRED"); assert.equal(after.find((r) => r.id === backup.id)?.status, "PENDING");
    const events = await db.select().from(s.statusEvents).where(eq(s.statusEvents.aggregateId, primary.id));
    const expired = events.filter((r) => r.eventType === "INVITATION_EXPIRED"); assert.equal(expired.length, 1);
    assert.equal(expired[0].actorUserId, null); assert.equal(expired[0].payloadJson.actorType, "SYSTEM");
    const notices = await db.select().from(s.notificationOutbox).where(eq(s.notificationOutbox.aggregateId, backup.id)); assert.equal(notices.length, 1);
    assert.equal((await post(`/api/v1/invitations/${primary.id}/respond`, b, `b7:${requestId}:late`, { action: "ACCEPT" })).status, 409);
    assert.equal((await post(`/api/v1/invitations/${backup.id}/respond`, b, `b7:${requestId}:forged`, { action: "ACCEPT" })).status, 404);
    const accepted = await Promise.all(Array.from({ length: 10 }, () => post(`/api/v1/invitations/${backup.id}/respond`, d, `b7:${requestId}:accept`, { action: "ACCEPT" })));
    assert.ok(accepted.every((r) => r.status === 200)); assert.equal(accepted.filter((r) => r.headers.get("Idempotency-Replayed") === "true").length, 9);
    const [session] = await db.select().from(s.sessions).where(eq(s.sessions.requestId, requestId)); assert.equal(session.status, "CONFIRMED");
    const members = await db.select().from(s.sessionMembers).where(eq(s.sessionMembers.sessionId, session.id)); assert.equal(members.length, 2);
    assert.equal(members.some((r) => r.userId === B), false); assert.equal(members.filter((r) => r.userId === D).length, 1);
    for (const token of [a, d]) {
      const detail = await app.request(`/api/v1/sessions/${session.id}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(detail.status, 200); assert.equal((await detail.json() as { data: { status: string } }).data.status, "CONFIRMED");
    }
  } finally {
    if (requestId) await db.transaction(async (tx) => {
      const sessions = await tx.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.requestId, requestId));
      const invitations = await tx.select({ id: s.invitations.id }).from(s.invitations).where(eq(s.invitations.requestId, requestId));
      const invitationIds = invitations.map(({ id }) => id); const sessionIds = sessions.map(({ id }) => id);
      const outbox = invitationIds.length ? await tx.select({ id: s.notificationOutbox.id }).from(s.notificationOutbox).where(inArray(s.notificationOutbox.aggregateId, invitationIds)) : [];
      if (outbox.length) await tx.delete(s.deliveryAttempts).where(inArray(s.deliveryAttempts.outboxId, outbox.map(({ id }) => id)));
      if (invitationIds.length) await tx.delete(s.notificationOutbox).where(inArray(s.notificationOutbox.aggregateId, invitationIds));
      await tx.delete(s.domainEvents).where(eq(s.domainEvents.requestId, requestId));
      await tx.delete(s.statusEvents).where(inArray(s.statusEvents.aggregateId, [requestId, ...sessionIds, ...invitationIds]));
      await tx.delete(s.idempotencyRecords).where(and(sql`${s.idempotencyRecords.idempotencyKey} like ${`b7:${requestId}:%`}`, inArray(s.idempotencyRecords.userId, [B, D])));
      await tx.delete(s.invitations).where(eq(s.invitations.requestId, requestId));
      if (sessionIds.length) await tx.delete(s.sessionMembers).where(inArray(s.sessionMembers.sessionId, sessionIds));
      await tx.delete(s.sessions).where(eq(s.sessions.requestId, requestId));
      await tx.delete(s.matchRuns).where(eq(s.matchRuns.requestId, requestId)); await tx.delete(s.requests).where(eq(s.requests.id, requestId));
    });
  }
};
test("B7 timeout job promotes exactly one backup and late acceptance cannot resurrect an invitation", () => scenario(false));
test("B7 ten late clicks racing three expiry scans cannot overfill or duplicate promotion", () => scenario(true));
