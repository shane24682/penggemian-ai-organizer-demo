import { AUTH_INVALID_EVENT } from "@/lib/auth-session";

export type RoleCode = "MODELING" | "CODING" | "WRITING" | "OPEN";

type ApiEnvelope<T> = {
  data: T;
  meta: { requestId: string };
};

type ApiErrorEnvelope = {
  error?: { code?: string; message?: string };
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type AuthSession = {
  accessToken: string;
  user: { id: string; schoolId: string; role: "USER" | "OPS" | "ADMIN"; displayName: string };
};

export type AuthUser = AuthSession["user"];

export type RegisterInput = {
  phoneE164: string;
  password: string;
  schoolCode: string;
  displayName: string;
  majorCategory: string;
  gradeYear: number;
};

export type PublishedRequest = {
  id: string;
  sceneCode: "MATH_MODELING";
  competitionName: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  weeklyHoursRequired: number;
  participantLimit: number;
  applicationDeadline: string;
  status: "DRAFT" | "OPEN" | "MATCHING" | "INVITING" | "FULFILLED" | "CANCELLED" | "EXPIRED";
  createdAt: string;
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
  return (env?.VITE_API_BASE_URL || "http://localhost:8788").replace(/\/$/, "");
})();

export const request = async <T>(path: string, init: RequestInit = {}, token?: string): Promise<T> => {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & ApiErrorEnvelope;
  if (!response.ok) {
    if (response.status === 401 && token && typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_INVALID_EVENT));
    }
    throw new ApiRequestError(
      payload.error?.message || `请求失败（HTTP ${response.status}）`,
      response.status,
      payload.error?.code,
    );
  }
  return payload.data;
};

export const login = (phoneE164: string, password: string) =>
  request<AuthSession>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ phoneE164, password }),
  });

export const register = (input: RegisterInput) =>
  request<AuthSession>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const getMe = (token: string) => request<AuthUser>("/api/v1/me", {}, token);

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
      headers: { "Idempotency-Key": crypto.randomUUID() },
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
    { method: "POST" },
    token,
  );

export const getCurrentMatching = (token: string, requestId: string) =>
  request<PersistedMatchRun>(`/api/v1/requests/${requestId}/matches/current`, {}, token);

export const getMyRequests = (token: string) =>
  request<PublishedRequest[]>("/api/v1/me/requests", {}, token);

export const cancelPublishedRequest = (token: string, requestId: string) =>
  request<PublishedRequest>(
    `/api/v1/requests/${requestId}/cancel`,
    { method: "POST" },
    token,
  );
