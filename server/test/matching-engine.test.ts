import assert from "node:assert/strict";
import test from "node:test";

import {
  ALGORITHM_VERSION,
  rankCandidates,
  scoreCandidate,
  timeOverlapRatio,
  type MatchingCandidate,
  type MatchingRequest,
  type MatchingRoleSlot,
} from "../src/matching/engine.js";

const request: MatchingRequest = {
  creatorUserId: "user-a",
  schoolId: "school-1",
  competitionName: "全国大学生数学建模竞赛",
  startsAt: new Date("2026-09-20T06:00:00Z"),
  endsAt: new Date("2026-09-20T08:00:00Z"),
  weeklyHoursRequired: 8,
};

const slot: MatchingRoleSlot = {
  id: "slot-coding",
  roleCode: "CODING",
  minLevel: 3,
  evidenceRequired: true,
};

const candidate = (overrides: Partial<MatchingCandidate> = {}): MatchingCandidate => ({
  userId: "user-b",
  schoolId: "school-1",
  status: "ACTIVE",
  displayName: "测试候选人",
  competitionTags: ["数学建模", "团队协作"],
  weeklyHours: 10,
  trustScore: 80,
  roleCode: "CODING",
  level: 4,
  verificationStatus: "VERIFIED",
  availability: [{ startsAt: new Date("2026-09-20T05:30:00Z"), endsAt: new Date("2026-09-20T08:30:00Z") }],
  hasScheduleConflict: false,
  ...overrides,
});

test("algorithm version is frozen", () => {
  assert.equal(ALGORITHM_VERSION, "match-rules-v0.1");
});

test("time overlap uses the best structured availability window", () => {
  assert.equal(timeOverlapRatio(request, candidate().availability), 1);
  assert.equal(
    timeOverlapRatio(request, [
      { startsAt: new Date("2026-09-20T04:00:00Z"), endsAt: new Date("2026-09-20T05:00:00Z") },
      { startsAt: new Date("2026-09-20T06:00:00Z"), endsAt: new Date("2026-09-20T07:00:00Z") },
    ]),
    0.5,
  );
});

test("eligible cold-start candidate receives an explainable score", () => {
  const scored = scoreCandidate(request, slot, candidate());
  assert.ok(scored);
  assert.equal(scored.trustScore, 80);
  assert.equal(scored.breakdown.reduce((total, item) => total + item.maxScore, 0), 100);
  assert.equal(scored.reasons.length, 3);
  assert.ok(scored.score >= 60);
});

test("hard filters reject ineligible candidates without fallback fabrication", () => {
  assert.equal(scoreCandidate(request, slot, candidate({ schoolId: "school-2" })), null);
  assert.equal(scoreCandidate(request, slot, candidate({ userId: "user-a" })), null);
  assert.equal(scoreCandidate(request, slot, candidate({ roleCode: "WRITING" })), null);
  assert.equal(scoreCandidate(request, slot, candidate({ level: 2 })), null);
  assert.equal(scoreCandidate(request, slot, candidate({ verificationStatus: "UNVERIFIED" })), null);
  assert.equal(scoreCandidate(request, slot, candidate({ weeklyHours: 7 })), null);
  assert.equal(scoreCandidate(request, slot, candidate({ hasScheduleConflict: true })), null);
  assert.equal(
    scoreCandidate(
      request,
      slot,
      candidate({
        availability: [{ startsAt: new Date("2026-09-20T06:00:00Z"), endsAt: new Date("2026-09-20T06:30:00Z") }],
      }),
    ),
    null,
  );
});

test("ranking is deterministic and uses user id as the final tie breaker", () => {
  const first = candidate({ userId: "user-b" });
  const second = candidate({ userId: "user-c" });
  const input = [second, first];
  const firstRun = rankCandidates(request, slot, input).map((item) => item.userId);
  const secondRun = rankCandidates(request, slot, input).map((item) => item.userId);
  assert.deepEqual(firstRun, ["user-b", "user-c"]);
  assert.deepEqual(secondRun, firstRun);
});
