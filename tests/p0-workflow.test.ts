import assert from "node:assert/strict";
import test from "node:test";

import { P0ApiError, request } from "../lib/p0-api";
import { invitationExplanation, loadWorkflowSnapshot, pendingOperation, startWorkflowPolling, statusLabel, writeWorkflow, type PollEnvironment, type Invitation } from "../lib/p0-workflow";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("H5 writes carry JWT, JSON, idempotency key and disable fetch cache", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-token");
    assert.equal(new Headers(init.headers).get("Idempotency-Key"), "test-key");
    assert.equal(new Headers(init.headers).get("Content-Type"), "application/json");
    assert.equal(init.cache, "no-store");
    assert.deepEqual(JSON.parse(init.body as string), { action: "ACCEPT" });
    return Response.json({ data: { saved: true }, meta: { requestId: "test" } });
  });
  assert.deepEqual(await writeWorkflow("test-token", "/api/v1/invitations/id/respond", { action: "ACCEPT" }, "test-key"), { saved: true });
});

test("H5 surfaces business code and request ID instead of faking success", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: "ROLE_SLOT_FULL", message: "名额已满" }, meta: { requestId: "trace" } }, { status: 409 }));
  await assert.rejects(request("/test"), (error) => error instanceof P0ApiError && error.status === 409 && error.code === "ROLE_SLOT_FULL" && error.requestId === "trace");
});

test("H5 handles invalid upstream responses and network errors explicitly", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json(null));
  await assert.rejects(request("/test"), (error) => error instanceof P0ApiError && error.code === "INVALID_API_RESPONSE");
  mock.mock.mockImplementation(async () => { throw new TypeError("network unavailable"); });
  await assert.rejects(request("/test"), (error) => error instanceof P0ApiError && error.code === "NETWORK_ERROR");
});

test("workflow recovery reads every fact from APIs and forwards cancellation", async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    paths.push(new URL(String(url)).pathname);
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ data: paths.at(-1)?.endsWith("/me") ? { id: "B", displayName: "B" } : [], meta: {} });
  });
  const recovered = await loadWorkflowSnapshot("token", "session", new AbortController().signal);
  assert.equal(recovered.user.id, "B");
  assert.deepEqual(paths.sort(), [
    "/api/v1/me", "/api/v1/me/invitations", "/api/v1/me/notifications", "/api/v1/me/requests", "/api/v1/me/sessions",
    "/api/v1/sessions/session", "/api/v1/sessions/session/checkins", "/api/v1/sessions/session/regroup-intents", "/api/v1/sessions/session/reviews",
  ].sort());
});

test("retry keys survive reload, isolate account/body, and clear after confirmed writes", async () => {
  const storage = new MemoryStorage();
  const body = { comment: "private-review", rating: 5 };
  const original = await pendingOperation("A", "/reviews", body, storage);
  assert.equal((await pendingOperation("A", "/reviews", body, storage)).key, original.key);
  assert.notEqual((await pendingOperation("B", "/reviews", body, storage)).key, original.key);
  assert.notEqual((await pendingOperation("A", "/reviews", { ...body, rating: 1 }, storage)).key, original.key);
  for (let index = 0; index < storage.length; index++) {
    assert.ok(!storage.key(index)?.includes("private-review"));
    assert.ok(!storage.getItem(storage.key(index)!)?.includes("private-review"));
  }
  original.clear();
  assert.notEqual((await pendingOperation("A", "/reviews", body, storage)).key, original.key);
});

test("backup presentation distinguishes queue, promotion, timeout and ended states", () => {
  const invitation = { status: "QUEUED", candidateType: "BACKUP" } as Invitation;
  assert.match(invitationExplanation(invitation), /自动递补/);
  assert.match(invitationExplanation({ ...invitation, status: "PENDING" }), /递补为正式邀请/);
  assert.match(invitationExplanation({ ...invitation, status: "EXPIRED" }), /已结束/);
  assert.equal(statusLabel("EXPIRED"), "已超时");
  assert.equal(statusLabel("CANCELLED"), "已取消");
});

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
test("polling uses five seconds foreground, sixty seconds background and immediate resume", async () => {
  let hidden = false; let listener = () => {}; let calls = 0; let sequence = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const env: PollEnvironment = {
    hidden: () => hidden, subscribe: (callback) => { listener = callback; return () => { listener = () => {}; }; },
    schedule: (callback, delay) => { timers.set(++sequence, { callback, delay }); return sequence as unknown as ReturnType<typeof setTimeout>; },
    cancel: (id) => { timers.delete(id as unknown as number); },
  };
  const stop = startWorkflowPolling(async () => { calls += 1; }, env);
  await flush();
  assert.equal(calls, 1); assert.ok([...timers.values()].some((timer) => timer.delay === 5000));
  hidden = true; listener();
  assert.ok([...timers.values()].some((timer) => timer.delay === 60_000));
  hidden = false; listener(); await flush(); assert.equal(calls, 2);
  stop(); assert.equal(timers.size, 0);
  listener(); await flush(); assert.equal(calls, 2);
});

test("polling never overlaps requests and aborts in-flight reads on unmount", async () => {
  let calls = 0; let release = () => {}; let listener = () => {}; let receivedSignal: AbortSignal | undefined;
  const env: PollEnvironment = {
    hidden: () => false, subscribe: (callback) => { listener = callback; return () => {}; },
    schedule: setTimeout, cancel: clearTimeout,
  };
  const stop = startWorkflowPolling(async (signal) => {
    calls += 1; receivedSignal = signal;
    await new Promise<void>((resolve) => { release = resolve; });
  }, env);
  listener(); listener(); assert.equal(calls, 1);
  stop(); assert.equal(receivedSignal?.aborted, true);
  release(); await flush(); assert.equal(calls, 1);
});
