export type RoleCode = "MODELING" | "CODING" | "WRITING" | "OPEN";

type ApiEnvelope<T> = {
  data: T;
  meta: { requestId: string };
};

type ApiErrorEnvelope = {
  error?: { code?: string; message?: string };
};

export type AuthSession = {
  accessToken: string;
  user: { id: string; schoolId: string; role: "USER" | "OPS" | "ADMIN"; displayName: string };
};

export type PublishedRequest = {
  id: string;
  competitionName: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

export type PersistedMatchCandidate = {
  id: string;
  userId: string;
  displayName: string;
  roleSlotId: string;
  rank: number;
  candidateType: "PRIMARY" | "BACKUP";
  score: string;
  breakdown: Array<{ key: string; label: string; score: number; maxScore: number; detail: string }>;
  reasons: string[];
  status: string;
};

export type PersistedMatchRun = {
  id: string;
  requestId: string;
  contractVersion: string;
  algorithmVersion: string;
  status: string;
  candidateCount: number;
  isCurrent: boolean;
  candidates: PersistedMatchCandidate[];
};

const apiBase = (() => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_API_BASE_URL || "http://localhost:8787").replace(/\/$/, "");
})();

export class P0ApiError extends Error {
  constructor(message: string, public status: number, public code: string, public requestId?: string) {
    super(message);
    this.name = "P0ApiError";
  }
}

export const request = async <T>(path: string, init: RequestInit = {}, token?: string): Promise<T> => {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiBase}${path}`, { ...init, headers, signal: controller.signal, cache: "no-store" });
    const raw: unknown = await response.json().catch(() => ({}));
    const payload = (raw && typeof raw === "object" ? raw : {}) as ApiEnvelope<T> & ApiErrorEnvelope;
    if (!response.ok) {
      throw new P0ApiError(payload.error?.message || `请求失败（HTTP ${response.status}）`,
        response.status, payload.error?.code || "HTTP_ERROR", payload.meta?.requestId);
    }
    if (!("data" in payload)) throw new P0ApiError("服务返回格式错误，请稍后重试", 502, "INVALID_API_RESPONSE");
    return payload.data;
  } catch (error) {
    if (error instanceof P0ApiError || init.signal?.aborted) throw error;
    throw new P0ApiError(controller.signal.aborted ? "请求超时，结果尚未确认，请重试" : "无法连接业务服务，请检查网络与服务地址", 0, controller.signal.aborted ? "NETWORK_TIMEOUT" : "NETWORK_ERROR");
  } finally {
    clearTimeout(timeout); init.signal?.removeEventListener("abort", forwardAbort);
  }
};

export const login = (phoneE164: string, password: string) =>
  request<AuthSession>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ phoneE164, password }),
  });

export const publishMathModelingRequest = (
  token: string,
  input: {
    title: string;
    startsAt: Date;
    endsAt: Date;
    weeklyHoursRequired: number;
  },
) =>
  request<PublishedRequest>(
    "/api/v1/requests",
    {
      method: "POST",
      body: JSON.stringify({
        competitionName: "全国大学生数学建模竞赛",
        title: input.title,
        description: "寻找一名编程成员和一名论文写作成员，完成首次启动会后进入正式协作。",
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString(),
        weeklyHoursRequired: input.weeklyHoursRequired,
        participantLimit: 3,
        applicationDeadline: new Date(input.startsAt.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        sourceChannel: "DIRECT",
        roleSlots: [
          { roleCode: "CODING", slotCount: 1, minLevel: 3, evidenceRequired: true },
          { roleCode: "WRITING", slotCount: 1, minLevel: 3, evidenceRequired: true },
        ],
      }),
    },
    token,
  );

export const runMatching = (token: string, requestId: string) =>
  request<{ runId: string; readyForInvitationDispatch: boolean }>(
    `/api/v1/requests/${requestId}/match`,
    { method: "POST", body: "{}" },
    token,
  );

export const getCurrentMatching = (token: string, requestId: string) =>
  request<PersistedMatchRun>(`/api/v1/requests/${requestId}/matches/current`, {}, token);
