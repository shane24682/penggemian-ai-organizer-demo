import type { ScoredCandidate } from "./matching";

export type InvitationStatus = "confirmed" | "waiting" | "queued" | "declined" | "timedout";

export type InvitationCandidate = ScoredCandidate & {
  invitationStatus: InvitationStatus;
  source: "recommended" | "backup";
};

export type InvitationRound = {
  candidates: InvitationCandidate[];
  backups: InvitationCandidate[];
  targetSeats: number;
  hostConfirmed: true;
  round: number;
};

export const createInvitationRound = (
  selected: ScoredCandidate[],
  backups: ScoredCandidate[],
  targetSeats: number,
): InvitationRound => ({
  candidates: selected.map((candidate, index) => ({
    ...candidate,
    invitationStatus: index < 2 ? "confirmed" : index < 4 ? "waiting" : "queued",
    source: "recommended",
  })),
  backups: backups.map(candidate => ({
    ...candidate,
    invitationStatus: "queued",
    source: "backup",
  })),
  targetSeats,
  hostConfirmed: true,
  round: 1,
});

export const invitationCounts = (round: InvitationRound) => ({
  confirmed: 1 + round.candidates.filter(candidate => candidate.invitationStatus === "confirmed").length,
  waiting: round.candidates.filter(candidate => candidate.invitationStatus === "waiting").length,
  backups: round.backups.filter(candidate => candidate.invitationStatus === "queued").length,
});

const promoteNext = (round: InvitationRound): InvitationRound => {
  const queuedIndex = round.candidates.findIndex(candidate => candidate.invitationStatus === "queued");
  if (queuedIndex >= 0) {
    return {
      ...round,
      candidates: round.candidates.map((candidate, index) =>
        index === queuedIndex ? { ...candidate, invitationStatus: "waiting" } : candidate
      ),
    };
  }
  const backupIndex = round.backups.findIndex(candidate => candidate.invitationStatus === "queued");
  if (backupIndex < 0) return round;
  const promoted = { ...round.backups[backupIndex], invitationStatus: "waiting" as const };
  return {
    ...round,
    candidates: [...round.candidates, promoted],
    backups: round.backups.filter((_, index) => index !== backupIndex),
  };
};

export const respondToInvitation = (
  round: InvitationRound,
  candidateId: string,
  response: "confirm" | "decline" | "timeout",
): InvitationRound => {
  const nextStatus: InvitationStatus = response === "confirm" ? "confirmed" : response === "decline" ? "declined" : "timedout";
  let next: InvitationRound = {
    ...round,
    round: round.round + 1,
    candidates: round.candidates.map(candidate =>
      candidate.id === candidateId ? { ...candidate, invitationStatus: nextStatus } : candidate
    ),
  };
  if (response !== "confirm") next = promoteNext(next);
  const counts = invitationCounts(next);
  if (counts.confirmed < next.targetSeats && counts.waiting === 0) next = promoteNext(next);
  return next;
};

export const advanceDemoInvitation = (round: InvitationRound): InvitationRound => {
  const waiting = round.candidates.find(candidate => candidate.invitationStatus === "waiting");
  if (!waiting) return promoteNext(round);
  // The first new response demonstrates a refusal and automatic replacement;
  // subsequent responses confirm until the activity reaches its threshold.
  const response = round.round === 1 ? "decline" : "confirm";
  return respondToInvitation(round, waiting.id, response);
};

export const maskDistance = (distanceKm: number) => {
  if (distanceKm <= 1) return "同校 · 约1km内";
  if (distanceKm <= 3) return "同校 · 约1—3km";
  return "同校 · 约3—5km";
};
