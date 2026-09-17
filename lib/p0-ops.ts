import { request } from "./p0-api";

export type OpsFilters = { schoolId: string; sceneCode: "MATH_MODELING"; sourceChannel?: string;
  status?: string; dataScope?: string; from: string; to: string; exceptionsOnly?: boolean };
export type OpsFlow = { requestId: string; title: string; requestStatus: string; dataScope: string; sourceChannel: string;
  creator: { userId: string; displayName: string }; session: { id: string; status: string } | null;
  counts: { candidates: number; invitations: number; pendingInvitations: number; acceptedInvitations: number;
    members: number; checkedIn: number; failedNotifications: number } };
export type OpsFlows = { items: OpsFlow[]; pagination: { hasMore: boolean; nextCursor: string | null; limit: number };
  records: { invitations: OpsRow[]; responses: OpsRow[]; sessions: OpsRow[]; checkins: OpsRow[];
    exceptions: { matching: OpsRow[]; notifications: OpsRow[]; absent: OpsRow[]; expiredInvitations: OpsRow[]; overdueInvitations: OpsRow[] } } };
export type OpsMetrics = { filters: { dataScope: "REAL"; schoolId: string; sceneCode: string; sourceChannel: string; from: string; to: string };
  formationRate: { numerator: number; denominator: number; rate: number };
  attendanceRate: { numerator: number; denominator: number; rate: number };
  regroupRate: { numerator: number; denominator: number; rate: number };
  unitCost: { directCostCents: number; opsMinutes: number; laborCostCents: number; totalAmountCents: number;
    completedSessions: number; amountCentsPerCompletedSession: number; currency: "CNY" } };
export type OpsRow = Record<string, unknown>;
export type OpsDetail = { request: { id: string; title: string; status: string; dataScope: string }; school: { name: string };
  matching: { runs: OpsRow[]; candidates: OpsRow[] }; roleSlots: OpsRow[];
  session: { id: string; status: string; members: OpsRow[]; checkins: OpsRow[]; reviews: OpsRow[]; regroupIntents: OpsRow[] } | null;
  invitations: OpsRow[]; notifications: OpsRow[]; deliveryAttempts: OpsRow[];
  events: { status: OpsRow[]; domain: OpsRow[] }; operations: { workLogs: OpsRow[]; costs: OpsRow[] } };

export const opsQuery = (filters: OpsFilters, metrics = false, cursor?: string) => {
  const query = new URLSearchParams({ schoolId: filters.schoolId, sceneCode: filters.sceneCode, from: filters.from, to: filters.to });
  if (filters.sourceChannel) query.set("sourceChannel", filters.sourceChannel);
  if (!metrics) {
    if (filters.status) query.set("status", filters.status);
    if (filters.dataScope) query.set("dataScope", filters.dataScope);
    if (filters.exceptionsOnly) query.set("exceptionsOnly", "true");
    query.set("limit", "20"); if (cursor) query.set("cursor", cursor);
  }
  return query.toString();
};
export const getOpsFlows = (token: string, filters: OpsFilters, cursor?: string, signal?: AbortSignal) =>
  request<OpsFlows>(`/api/v1/ops/flows?${opsQuery(filters, false, cursor)}`, { signal }, token);
export const getOpsMetrics = (token: string, filters: OpsFilters, signal?: AbortSignal) =>
  request<OpsMetrics>(`/api/v1/ops/metrics?${opsQuery(filters, true)}`, { signal }, token);
export const getOpsDetail = (token: string, requestId: string, schoolId: string, signal?: AbortSignal) =>
  request<OpsDetail>(`/api/v1/ops/flows/${encodeURIComponent(requestId)}?schoolId=${encodeURIComponent(schoolId)}`, { signal }, token);
