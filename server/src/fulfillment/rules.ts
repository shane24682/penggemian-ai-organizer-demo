import { ApiError } from "../http/errors.js";

// Provisional B4 policy: the frozen contract requires a server-checked window,
// but does not specify minute thresholds. Keep them explicit and centralized.
export const CHECKIN_POLICY = { earlyMinutes: 30, lateMinutes: 15 } as const;

export const decideCheckin = (
  session: { status: string; startsAt: Date; endsAt: Date },
  memberStatus: string,
  now: Date,
) => {
  if (!["CONFIRMED", "IN_PROGRESS"].includes(session.status) || memberStatus !== "CONFIRMED") {
    throw new ApiError(409, "CHECKIN_NOT_ALLOWED", "当前活动或成员状态不允许签到");
  }
  if (now.getTime() < session.startsAt.getTime() - CHECKIN_POLICY.earlyMinutes * 60_000 || now >= session.endsAt) {
    throw new ApiError(409, "CHECKIN_WINDOW_CLOSED", "不在签到时间窗口内");
  }
  return now.getTime() > session.startsAt.getTime() + CHECKIN_POLICY.lateMinutes * 60_000
    ? ("LATE" as const)
    : ("PRESENT" as const);
};

export const assertCompletedParticipant = (sessionStatus: string, memberStatus: string) => {
  if (sessionStatus !== "COMPLETED" || memberStatus !== "COMPLETED") {
    throw new ApiError(409, "COMPLETED_PARTICIPATION_REQUIRED", "仅活动完成后的已到场成员可操作");
  }
};

export const boundedTrustScore = (score: number, delta: number) => Math.max(0, Math.min(100, score + delta));

export const mutuallyWillingUserIds = (
  userId: string,
  ownChoices: string[],
  intents: Array<{ userId: string; willingUserIdsJson: string[]; status: string }>,
) => ownChoices.filter((otherId) => intents.some(
  (intent) => intent.userId === otherId && intent.status !== "CLOSED" && intent.willingUserIdsJson.includes(userId),
));
