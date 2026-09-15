import { ApiError } from "../http/errors.js";

export type InvitationAction = "ACCEPT" | "DECLINE" | "EXPIRE";
export type InvitationState = "QUEUED" | "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";

export type InvitationDecision =
  | { kind: "TRANSITION"; toStatus: "ACCEPTED" | "DECLINED" | "EXPIRED" }
  | { kind: "IDEMPOTENT"; toStatus: "ACCEPTED" | "DECLINED" | "EXPIRED" };

const targetStatus = (action: InvitationAction) =>
  ({ ACCEPT: "ACCEPTED", DECLINE: "DECLINED", EXPIRE: "EXPIRED" })[action] as
    | "ACCEPTED"
    | "DECLINED"
    | "EXPIRED";

export const decideInvitationTransition = (
  state: InvitationState,
  action: InvitationAction,
  expiresAt: Date | null,
  now: Date,
): InvitationDecision => {
  const target = targetStatus(action);
  if (state === target) return { kind: "IDEMPOTENT", toStatus: target };
  if (state !== "PENDING") {
    throw new ApiError(409, "INVITATION_NOT_PENDING", "该邀请已处理", { status: state });
  }
  if (action !== "EXPIRE" && expiresAt && expiresAt <= now) {
    return { kind: "TRANSITION", toStatus: "EXPIRED" };
  }
  return { kind: "TRANSITION", toStatus: target };
};

export const isSessionFulfilled = (confirmedMemberCount: number, participantLimit: number) =>
  confirmedMemberCount >= participantLimit;
