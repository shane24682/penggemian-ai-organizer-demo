export const CONTRACT_VERSION = "contract-v0.1";
export const ALGORITHM_VERSION = "match-rules-v0.1";

export type CapabilityRole = "MODELING" | "CODING" | "WRITING" | "OPEN";
export type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export type MatchingRequest = {
  creatorUserId: string;
  schoolId: string;
  competitionName: string;
  startsAt: Date;
  endsAt: Date;
  weeklyHoursRequired: number;
};

export type MatchingRoleSlot = {
  id: string;
  roleCode: CapabilityRole;
  minLevel: number;
  evidenceRequired: boolean;
};

export type MatchingCandidate = {
  userId: string;
  schoolId: string;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  displayName: string;
  competitionTags: string[];
  weeklyHours: number;
  trustScore: number;
  roleCode: CapabilityRole;
  level: number;
  verificationStatus: VerificationStatus;
  availability: Array<{ startsAt: Date; endsAt: Date }>;
  hasScheduleConflict: boolean;
};

export type ScoreBreakdown = {
  key: "role" | "time" | "goal" | "commitment" | "trust";
  label: string;
  score: number;
  maxScore: number;
  detail: string;
};

export type RankedCandidate = MatchingCandidate & {
  score: number;
  profileCompleteness: number;
  breakdown: ScoreBreakdown[];
  reasons: string[];
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const rounded = (value: number) => Math.round(value * 100) / 100;

export const timeOverlapRatio = (
  request: Pick<MatchingRequest, "startsAt" | "endsAt">,
  availability: MatchingCandidate["availability"],
): number => {
  const requestStart = request.startsAt.getTime();
  const requestEnd = request.endsAt.getTime();
  const duration = requestEnd - requestStart;
  if (duration <= 0) return 0;

  return availability.reduce((best, window) => {
    const overlap = Math.max(
      0,
      Math.min(requestEnd, window.endsAt.getTime()) - Math.max(requestStart, window.startsAt.getTime()),
    );
    return Math.max(best, overlap / duration);
  }, 0);
};

const goalFit = (request: MatchingRequest, candidate: MatchingCandidate): number => {
  const normalizedCompetition = request.competitionName.toLowerCase();
  const tags = candidate.competitionTags.map((tag) => tag.toLowerCase());
  if (tags.some((tag) => tag === normalizedCompetition || normalizedCompetition.includes(tag))) return 1;
  if (tags.some((tag) => tag.includes("数学建模") || tag.includes("数模"))) return 0.8;
  if (tags.some((tag) => tag.includes("竞赛") || tag.includes("团队协作"))) return 0.6;
  return 0.3;
};

const profileCompleteness = (candidate: MatchingCandidate): number =>
  [candidate.displayName, candidate.competitionTags.length > 0, candidate.weeklyHours > 0, candidate.availability.length > 0]
    .filter(Boolean).length;

export const scoreCandidate = (
  request: MatchingRequest,
  slot: MatchingRoleSlot,
  candidate: MatchingCandidate,
): RankedCandidate | null => {
  const overlapRatio = timeOverlapRatio(request, candidate.availability);
  const matchesRole = slot.roleCode === "OPEN" || candidate.roleCode === slot.roleCode;
  const hasRequiredEvidence = !slot.evidenceRequired || candidate.verificationStatus === "VERIFIED";

  if (
    candidate.status !== "ACTIVE" ||
    candidate.schoolId !== request.schoolId ||
    candidate.userId === request.creatorUserId ||
    !matchesRole ||
    candidate.level < slot.minLevel ||
    !hasRequiredEvidence ||
    candidate.weeklyHours < request.weeklyHoursRequired ||
    overlapRatio < 0.5 ||
    candidate.hasScheduleConflict
  ) {
    return null;
  }

  const verificationFit = candidate.verificationStatus === "VERIFIED" ? 1 : 0.85;
  const roleFit = verificationFit * (0.7 + 0.3 * clamp(candidate.level / 5));
  const goal = goalFit(request, candidate);
  const commitmentFit = request.weeklyHoursRequired
    ? clamp(candidate.weeklyHours / request.weeklyHoursRequired)
    : 1;
  const trustFit = clamp(candidate.trustScore / 100);
  const breakdown: ScoreBreakdown[] = [
    {
      key: "role",
      label: "角色与能力",
      score: rounded(35 * roleFit),
      maxScore: 35,
      detail: `${candidate.roleCode} 能力 ${candidate.level}/5${candidate.verificationStatus === "VERIFIED" ? "，已验证" : ""}`,
    },
    {
      key: "time",
      label: "时间匹配",
      score: rounded(25 * overlapRatio),
      maxScore: 25,
      detail: `启动会时间重合 ${Math.round(overlapRatio * 100)}%`,
    },
    {
      key: "goal",
      label: "竞赛目标",
      score: rounded(20 * goal),
      maxScore: 20,
      detail: goal >= 0.8 ? "数学建模目标一致" : "具备竞赛协作标签",
    },
    {
      key: "commitment",
      label: "每周投入",
      score: rounded(10 * commitmentFit),
      maxScore: 10,
      detail: `每周可投入 ${candidate.weeklyHours} 小时`,
    },
    {
      key: "trust",
      label: "履约信用",
      score: rounded(10 * trustFit),
      maxScore: 10,
      detail: `履约信用 ${candidate.trustScore}/100`,
    },
  ];
  const score = rounded(breakdown.reduce((total, item) => total + item.score, 0));
  const reasons = [...breakdown]
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
    .slice(0, 3)
    .map((item) => item.detail);

  return {
    ...candidate,
    score,
    profileCompleteness: profileCompleteness(candidate),
    breakdown,
    reasons,
  };
};

export const rankCandidates = (
  request: MatchingRequest,
  slot: MatchingRoleSlot,
  candidates: MatchingCandidate[],
): RankedCandidate[] =>
  candidates
    .map((candidate) => scoreCandidate(request, slot, candidate))
    .filter((candidate): candidate is RankedCandidate => candidate !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.trustScore - left.trustScore ||
        right.profileCompleteness - left.profileCompleteness ||
        left.userId.localeCompare(right.userId),
    );
