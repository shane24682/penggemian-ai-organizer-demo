import { request } from "./p0-api";
import type { AuthSession, PublishedRequest } from "./p0-api";

export const P0_TOKEN_KEY = "penggemian-p0-access-token";
export type P0User = AuthSession["user"];
export type Invitation = {
  id: string; requestId: string; sessionId: string; status: string; queuePosition: number;
  candidateType: "PRIMARY" | "BACKUP"; requestTitle: string; competitionName: string;
  startsAt: string; endsAt: string; expiresAt: string | null;
};
export type SessionSummary = {
  id: string; requestId: string; status: string; title: string;
  startsAt: string; endsAt: string; memberStatus: string;
};
export type SessionDetail = Omit<SessionSummary, "memberStatus"> & {
  competitionName: string;
  members: Array<{ userId: string; displayName: string; memberType: string; memberStatus: string }>;
};
export type CheckinSummary = {
  eligible: boolean; reason: string | null; opensAt: string; closesAt: string; lateAfter: string;
  records: Array<{ userId: string; status: string; checkedInAt: string | null }>;
};
export type Review = { id: string; revieweeUserId: string; rating: number; tagsJson: string[]; comment: string | null };
export type RegroupState = {
  intent: { id: string; status: string; willingUserIdsJson: string[] } | null;
  mutualUserIds: string[];
};
export type Notification = { id: string; templateCode: string; aggregateId: string; readAt: string | null; sentAt: string };
export type SessionBundle = { session: SessionDetail; checkins: CheckinSummary; reviews: Review[]; regroup: RegroupState };
export type WorkflowSnapshot = {
  user: P0User; invitations: Invitation[]; sessions: SessionSummary[];
  requests: PublishedRequest[]; notifications: Notification[]; detail: SessionBundle | null;
};

export const loadWorkflowSnapshot = async (token: string, sessionId: string, signal?: AbortSignal): Promise<WorkflowSnapshot> => {
  const get = <T>(path: string) => request<T>(path, { signal }, token);
  const [user, invitations, sessions, requests, notifications, detail] = await Promise.all([
    get<P0User>("/api/v1/me"), get<Invitation[]>("/api/v1/me/invitations"),
    get<SessionSummary[]>("/api/v1/me/sessions"), get<PublishedRequest[]>("/api/v1/me/requests"),
    get<Notification[]>("/api/v1/me/notifications"),
    sessionId ? Promise.all([
      get<SessionDetail>(`/api/v1/sessions/${sessionId}`),
      get<CheckinSummary>(`/api/v1/sessions/${sessionId}/checkins`),
      get<Review[]>(`/api/v1/sessions/${sessionId}/reviews`),
      get<RegroupState>(`/api/v1/sessions/${sessionId}/regroup-intents`),
    ]).then(([session, checkins, reviews, regroup]) => ({ session, checkins, reviews, regroup })) : null,
  ]);
  return { user, invitations, sessions, requests, notifications, detail };
};

export const writeWorkflow = <T>(token: string, path: string, body: unknown, key: string) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": key } }, token);

// Only retry keys are stored, not business results or private review text.
export const pendingOperation = async (userId: string, path: string, body: unknown, storage: Storage) => {
  const bytes = new TextEncoder().encode(JSON.stringify({ userId, path, body }));
  let hash: string;
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } else {
    // LAN HTTP testing lacks SubtleCrypto. This fingerprint is only a retry
    // lookup, never an authorization/integrity check (the server uses SHA-256).
    let first = 0x811c9dc5; let second = 0x9e3779b9;
    for (const byte of bytes) { first = Math.imul(first ^ byte, 0x01000193); second = Math.imul(second ^ byte, 0x85ebca6b); }
    hash = `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
  }
  const storageKey = `penggemian-p0-pending:${hash}`;
  const key = storage.getItem(storageKey) || Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  storage.setItem(storageKey, key);
  return { key, clear: () => storage.removeItem(storageKey) };
};

const statusLabels: Record<string, string> = {
  QUEUED: "候补排队", PENDING: "待回应", ACCEPTED: "已接受", DECLINED: "已拒绝",
  EXPIRED: "已超时", CANCELLED: "已取消", FORMING: "组队中", CONFIRMED: "已成局",
  IN_PROGRESS: "进行中", COMPLETED: "已完成", NO_SHOW: "缺席", WITHDRAWN: "已退出",
  PRESENT: "已到场", LATE: "迟到", ABSENT: "未到场", OPEN: "等待互选", MATCHED: "双方有意愿", CLOSED: "已结束",
};
export const statusLabel = (status: string) => statusLabels[status] || status;

export const invitationExplanation = (invitation: Invitation) => {
  if (invitation.status === "QUEUED") return "正在候补队列中；主选拒绝或超时后由服务端自动递补。排队位置不是等待人数。";
  if (invitation.status === "PENDING" && invitation.candidateType === "BACKUP") return "已由候补递补为正式邀请，请在有效期内回应。";
  if (invitation.status === "PENDING") return "你是本轮主选，请在有效期内回应。";
  return "邀请已结束，最终状态以服务端记录为准。";
};

export type PollEnvironment = {
  hidden: () => boolean; subscribe: (callback: () => void) => () => void;
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel: (id: ReturnType<typeof setTimeout>) => void;
};
export const startWorkflowPolling = (
  task: (signal: AbortSignal) => Promise<void>,
  environment: PollEnvironment = {
    hidden: () => document.hidden,
    subscribe: (callback) => { document.addEventListener("visibilitychange", callback); return () => document.removeEventListener("visibilitychange", callback); },
    schedule: (callback, delay) => setTimeout(callback, delay), cancel: (id) => clearTimeout(id),
  },
) => {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let running = false;
  let refreshAgain = false;
  const tick = async () => {
    if (stopped) return;
    if (running) { refreshAgain = true; return; }
    running = true;
    controller = new AbortController();
    const timeout = environment.schedule(() => controller?.abort(), 15_000);
    try { await task(controller.signal); } catch { /* Caller reports failures; keep polling alive. */ }
    finally {
      environment.cancel(timeout);
      running = false;
      if (!stopped) {
        timer = environment.schedule(() => { refreshAgain = false; void tick(); }, refreshAgain ? 0 : environment.hidden() ? 60_000 : 5_000);
      }
    }
  };
  const unsubscribe = environment.subscribe(() => {
    if (timer) environment.cancel(timer);
    if (!environment.hidden()) void tick();
    else if (!running) timer = environment.schedule(() => { void tick(); }, 60_000);
  });
  void tick();
  return () => { stopped = true; if (timer) environment.cancel(timer); controller?.abort(); unsubscribe(); };
};
