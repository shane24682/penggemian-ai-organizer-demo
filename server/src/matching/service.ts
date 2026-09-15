import { and, eq, ne } from "drizzle-orm";

import type { Database } from "../db/client.js";
import {
  matchCandidates,
  matchRuns,
  requestRoleSlots,
  requests,
  userAvailability,
  userCapabilities,
  userProfiles,
  users,
} from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";
import {
  ALGORITHM_VERSION,
  CONTRACT_VERSION,
  rankCandidates,
  type CapabilityRole,
  type MatchingCandidate,
  type MatchingRequest,
  type MatchingRoleSlot,
  type RankedCandidate,
} from "./engine.js";

type PlannedCandidate = {
  roleSlotId: string;
  rank: number;
  candidateType: "PRIMARY" | "BACKUP";
  candidate: RankedCandidate;
};

export type MatchingExecution = {
  runId: string;
  requestId: string;
  contractVersion: string;
  algorithmVersion: string;
  readyForInvitationDispatch: boolean;
  unfilledRoleSlotIds: string[];
  candidates: PlannedCandidate[];
};

const loadCandidates = async (db: Database, request: MatchingRequest): Promise<MatchingCandidate[]> => {
  const rows = await db
    .select({
      userId: users.id,
      schoolId: users.schoolId,
      status: users.status,
      displayName: userProfiles.displayName,
      competitionTags: userProfiles.competitionTags,
      weeklyHours: userProfiles.weeklyHours,
      trustScore: userProfiles.trustScore,
      roleCode: userCapabilities.roleCode,
      level: userCapabilities.level,
      verificationStatus: userCapabilities.verificationStatus,
      availabilityStartsAt: userAvailability.startsAt,
      availabilityEndsAt: userAvailability.endsAt,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .innerJoin(userCapabilities, eq(userCapabilities.userId, users.id))
    .innerJoin(userAvailability, eq(userAvailability.userId, users.id))
    .where(
      and(
        eq(users.status, "ACTIVE"),
        eq(users.schoolId, request.schoolId),
        ne(users.id, request.creatorUserId),
      ),
    );

  const grouped = new Map<string, MatchingCandidate>();
  for (const row of rows) {
    const key = `${row.userId}:${row.roleCode}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.availability.push({ startsAt: row.availabilityStartsAt, endsAt: row.availabilityEndsAt });
      continue;
    }
    grouped.set(key, {
      userId: row.userId,
      schoolId: row.schoolId,
      status: row.status,
      displayName: row.displayName,
      competitionTags: row.competitionTags,
      weeklyHours: row.weeklyHours,
      trustScore: row.trustScore,
      roleCode: row.roleCode,
      level: row.level,
      verificationStatus: row.verificationStatus,
      availability: [{ startsAt: row.availabilityStartsAt, endsAt: row.availabilityEndsAt }],
      // The invitation/session owner will replace this with a real overlap query when their schema is integrated.
      hasScheduleConflict: false,
    });
  }
  return [...grouped.values()];
};

export const executeMatching = async (db: Database, requestId: string): Promise<MatchingExecution> => {
  const [requestRow] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!requestRow) throw new ApiError(404, "REQUEST_NOT_FOUND", "需求不存在");
  if (!["OPEN", "MATCHING"].includes(requestRow.status)) {
    throw new ApiError(409, "REQUEST_NOT_MATCHABLE", "当前需求状态不能重新匹配");
  }

  const roleRows = await db
    .select()
    .from(requestRoleSlots)
    .where(eq(requestRoleSlots.requestId, requestId));
  if (!roleRows.length) throw new ApiError(422, "ROLE_SLOTS_REQUIRED", "需求没有角色空位");

  const [run] = await db
    .insert(matchRuns)
    .values({
      requestId,
      contractVersion: CONTRACT_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
      parametersJson: {
        primaryThreshold: 60,
        backupThreshold: 50,
        backupLimitPerSlot: 5,
        weights: { role: 35, time: 25, goal: 20, commitment: 10, trust: 10 },
      },
    })
    .returning({ id: matchRuns.id });

  try {
    const request: MatchingRequest = {
      creatorUserId: requestRow.creatorUserId,
      schoolId: requestRow.schoolId,
      competitionName: requestRow.competitionName,
      startsAt: requestRow.startsAt,
      endsAt: requestRow.endsAt,
      weeklyHoursRequired: requestRow.weeklyHoursRequired,
    };
    const pool = await loadCandidates(db, request);
    const planned: PlannedCandidate[] = [];
    const assignedUserIds = new Set<string>();
    const unfilledRoleSlotIds: string[] = [];
    const orderedSlots = [...roleRows].sort((left, right) => {
      if (left.roleCode === "OPEN" && right.roleCode !== "OPEN") return 1;
      if (right.roleCode === "OPEN" && left.roleCode !== "OPEN") return -1;
      return left.id.localeCompare(right.id);
    });

    for (const slotRow of orderedSlots) {
      const slot: MatchingRoleSlot = {
        id: slotRow.id,
        roleCode: slotRow.roleCode as CapabilityRole,
        minLevel: slotRow.minLevel,
        evidenceRequired: slotRow.evidenceRequired,
      };
      const ranked = rankCandidates(request, slot, pool).filter(
        (candidate) => !assignedUserIds.has(candidate.userId),
      );
      const primaries = ranked.filter((candidate) => candidate.score >= 60).slice(0, slotRow.slotCount);
      if (primaries.length < slotRow.slotCount) {
        unfilledRoleSlotIds.push(slot.id);
      }
      primaries.forEach((candidate, index) => {
        assignedUserIds.add(candidate.userId);
        planned.push({ roleSlotId: slot.id, rank: index + 1, candidateType: "PRIMARY", candidate });
      });

      const backups = ranked
        .filter((candidate) => !primaries.some((primary) => primary.userId === candidate.userId) && candidate.score >= 50)
        .filter((candidate) => !assignedUserIds.has(candidate.userId))
        .slice(0, 5);
      backups.forEach((candidate, index) => {
        assignedUserIds.add(candidate.userId);
        planned.push({
          roleSlotId: slot.id,
          rank: slotRow.slotCount + index + 1,
          candidateType: "BACKUP",
          candidate,
        });
      });
    }

    await db.transaction(async (tx) => {
      await tx.update(matchRuns).set({ isCurrent: false }).where(eq(matchRuns.requestId, requestId));
      if (planned.length) {
        await tx.insert(matchCandidates).values(
          planned.map((item) => ({
            matchRunId: run.id,
            requestId,
            userId: item.candidate.userId,
            roleSlotId: item.roleSlotId,
            rank: item.rank,
            candidateType: item.candidateType,
            score: item.candidate.score.toFixed(2),
            breakdownJson: item.candidate.breakdown,
            reasonsJson: item.candidate.reasons,
          })),
        );
      }
      await tx
        .update(matchRuns)
        .set({
          status: "SUCCEEDED",
          candidateCount: planned.length,
          isCurrent: true,
          finishedAt: new Date(),
        })
        .where(eq(matchRuns.id, run.id));
    });

    return {
      runId: run.id,
      requestId,
      contractVersion: CONTRACT_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
      readyForInvitationDispatch: unfilledRoleSlotIds.length === 0,
      unfilledRoleSlotIds,
      candidates: planned,
    };
  } catch (error) {
    await db
      .update(matchRuns)
      .set({
        status: "FAILED",
        errorCode: error instanceof ApiError ? error.code : "MATCHING_FAILED",
        errorDetail: error instanceof Error ? error.message : "Unknown matching error",
        finishedAt: new Date(),
      })
      .where(eq(matchRuns.id, run.id));
    throw error;
  }
};

export const getCurrentMatching = async (db: Database, requestId: string) => {
  const [run] = await db
    .select()
    .from(matchRuns)
    .where(and(eq(matchRuns.requestId, requestId), eq(matchRuns.isCurrent, true)))
    .limit(1);
  if (!run) throw new ApiError(404, "MATCH_RUN_NOT_FOUND", "尚未生成匹配结果");

  const candidates = await db
    .select({
      id: matchCandidates.id,
      userId: matchCandidates.userId,
      displayName: userProfiles.displayName,
      roleSlotId: matchCandidates.roleSlotId,
      rank: matchCandidates.rank,
      candidateType: matchCandidates.candidateType,
      score: matchCandidates.score,
      breakdown: matchCandidates.breakdownJson,
      reasons: matchCandidates.reasonsJson,
      status: matchCandidates.candidateStatus,
    })
    .from(matchCandidates)
    .innerJoin(userProfiles, eq(userProfiles.userId, matchCandidates.userId))
    .where(eq(matchCandidates.matchRunId, run.id))
    .orderBy(matchCandidates.roleSlotId, matchCandidates.rank);

  return { ...run, candidates };
};
