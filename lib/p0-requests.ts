import type { PublishedRequest } from "./p0-api";

export const requestStatusLabel: Record<PublishedRequest["status"], string> = {
  DRAFT: "草稿",
  OPEN: "等待匹配",
  MATCHING: "匹配中",
  INVITING: "邀请中",
  FULFILLED: "已成局",
  CANCELLED: "已取消",
  EXPIRED: "已结束",
};

export const activeRequestStatuses = new Set<PublishedRequest["status"]>([
  "DRAFT",
  "OPEN",
  "MATCHING",
  "INVITING",
]);

export const canRunRequestMatching = (status: PublishedRequest["status"]) =>
  status === "OPEN" || status === "MATCHING";

export const canCancelRequest = (status: PublishedRequest["status"]) =>
  activeRequestStatuses.has(status);

export const chooseRequestId = (requests: PublishedRequest[], preferredId: string) =>
  requests.some((request) => request.id === preferredId) ? preferredId : requests[0]?.id || "";
