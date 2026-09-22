import type { B1Schema } from "../../src/db/schema/lifecycle.js";

export type B1SeedRows = {
  [TableName in keyof B1Schema]: B1Schema[TableName] extends {
    $inferInsert: infer InsertRow;
  }
    ? InsertRow[]
    : never;
};

export interface B1SeedReferences {
  schoolId: string;
  requestId: string;
  codingRoleSlotId: string;
  writingRoleSlotId: string;
  candidateBId: string;
  candidateCId: string;
  candidateDId: string;
  userAId: string;
  userBId: string;
  userCId: string;
  userDId: string;
  opsUserId: string;
}

/** Stable B-owned IDs so seed reruns can use upserts in the unified seed job. */
export const B1_SEED_IDS = {
  session: "b1000000-0000-4000-8000-000000000001",
  memberA: "b1000000-0000-4000-8000-000000000002",
  memberC: "b1000000-0000-4000-8000-000000000003",
  memberD: "b1000000-0000-4000-8000-000000000004",
  invitationB: "b1000000-0000-4000-8000-000000000005",
  invitationC: "b1000000-0000-4000-8000-000000000006",
  invitationD: "b1000000-0000-4000-8000-000000000007",
  checkinA: "b1000000-0000-4000-8000-000000000008",
  checkinC: "b1000000-0000-4000-8000-000000000009",
  checkinD: "b1000000-0000-4000-8000-00000000000a",
  reviewAtoC: "b1000000-0000-4000-8000-00000000000b",
  regroupA: "b1000000-0000-4000-8000-00000000000c",
  regroupC: "b1000000-0000-4000-8000-00000000000d",
  notificationD: "b1000000-0000-4000-8000-00000000000e",
  domainEvent: "b1000000-0000-4000-8000-00000000000f",
  statusEvent: "b1000000-0000-4000-8000-000000000010",
  opsWorkLog: "b1000000-0000-4000-8000-000000000011",
  costItem: "b1000000-0000-4000-8000-000000000012",
} as const;

/**
 * Produces a coherent TEST-scope lifecycle for Floyd's unified seed script:
 * B declines, D is promoted, then A/C/D complete the first meeting.
 */
export function createB1SeedRows(refs: B1SeedReferences): B1SeedRows {
  const startsAt = new Date("2026-09-20T02:00:00.000Z");
  const endsAt = new Date("2026-09-20T04:00:00.000Z");
  const createdAt = new Date("2026-09-16T02:00:00.000Z");
  const respondedAt = new Date("2026-09-16T02:10:00.000Z");

  return {
    sessions: [
      {
        id: B1_SEED_IDS.session,
        requestId: refs.requestId,
        schoolId: refs.schoolId,
        status: "COMPLETED" as const,
        startsAt,
        endsAt,
        createdAt,
        updatedAt: endsAt,
      },
    ],
    sessionMembers: [
      {
        id: B1_SEED_IDS.memberA,
        sessionId: B1_SEED_IDS.session,
        userId: refs.userAId,
        roleSlotId: null,
        memberType: "HOST" as const,
        memberStatus: "COMPLETED" as const,
        joinedAt: createdAt,
        createdAt,
        updatedAt: endsAt,
      },
      {
        id: B1_SEED_IDS.memberC,
        sessionId: B1_SEED_IDS.session,
        userId: refs.userCId,
        roleSlotId: refs.writingRoleSlotId,
        memberType: "PARTICIPANT" as const,
        memberStatus: "COMPLETED" as const,
        joinedAt: respondedAt,
        createdAt: respondedAt,
        updatedAt: endsAt,
      },
      {
        id: B1_SEED_IDS.memberD,
        sessionId: B1_SEED_IDS.session,
        userId: refs.userDId,
        roleSlotId: refs.codingRoleSlotId,
        memberType: "PARTICIPANT" as const,
        memberStatus: "COMPLETED" as const,
        joinedAt: respondedAt,
        createdAt: respondedAt,
        updatedAt: endsAt,
      },
    ],
    invitations: [
      {
        id: B1_SEED_IDS.invitationB,
        requestId: refs.requestId,
        sessionId: B1_SEED_IDS.session,
        matchCandidateId: refs.candidateBId,
        inviteeUserId: refs.userBId,
        roleSlotId: refs.codingRoleSlotId,
        status: "DECLINED" as const,
        queuePosition: 0,
        sentAt: createdAt,
        expiresAt: new Date("2026-09-16T08:00:00.000Z"),
        respondedAt,
        createdAt,
        updatedAt: respondedAt,
      },
      {
        id: B1_SEED_IDS.invitationC,
        requestId: refs.requestId,
        sessionId: B1_SEED_IDS.session,
        matchCandidateId: refs.candidateCId,
        inviteeUserId: refs.userCId,
        roleSlotId: refs.writingRoleSlotId,
        status: "ACCEPTED" as const,
        queuePosition: 0,
        sentAt: createdAt,
        expiresAt: new Date("2026-09-16T08:00:00.000Z"),
        respondedAt,
        createdAt,
        updatedAt: respondedAt,
      },
      {
        id: B1_SEED_IDS.invitationD,
        requestId: refs.requestId,
        sessionId: B1_SEED_IDS.session,
        matchCandidateId: refs.candidateDId,
        inviteeUserId: refs.userDId,
        roleSlotId: refs.codingRoleSlotId,
        status: "ACCEPTED" as const,
        queuePosition: 1,
        sentAt: respondedAt,
        expiresAt: new Date("2026-09-16T08:10:00.000Z"),
        respondedAt: new Date("2026-09-16T02:20:00.000Z"),
        createdAt,
        updatedAt: new Date("2026-09-16T02:20:00.000Z"),
      },
    ],
    checkins: [refs.userAId, refs.userCId, refs.userDId].map((userId, index) => ({
      id: [B1_SEED_IDS.checkinA, B1_SEED_IDS.checkinC, B1_SEED_IDS.checkinD][index],
      sessionId: B1_SEED_IDS.session,
      userId,
      status: "PRESENT" as const,
      method: "SELF_CONFIRM" as const,
      checkedInAt: new Date(startsAt.getTime() + index * 60_000),
      createdAt: new Date(startsAt.getTime() + index * 60_000),
    })),
    reviews: [
      {
        id: B1_SEED_IDS.reviewAtoC,
        sessionId: B1_SEED_IDS.session,
        reviewerUserId: refs.userAId,
        revieweeUserId: refs.userCId,
        rating: 5,
        tagsJson: ["沟通顺畅", "按时交付"],
        comment: "B1 TEST seed",
        createdAt: endsAt,
      },
    ],
    regroupIntents: [
      {
        id: B1_SEED_IDS.regroupA,
        sessionId: B1_SEED_IDS.session,
        userId: refs.userAId,
        willingUserIdsJson: [refs.userCId],
        status: "MATCHED" as const,
        createdAt: endsAt,
        updatedAt: endsAt,
      },
      {
        id: B1_SEED_IDS.regroupC,
        sessionId: B1_SEED_IDS.session,
        userId: refs.userCId,
        willingUserIdsJson: [refs.userAId],
        status: "MATCHED" as const,
        createdAt: endsAt,
        updatedAt: endsAt,
      },
    ],
    notificationOutbox: [
      {
        id: B1_SEED_IDS.notificationD,
        recipientUserId: refs.userDId,
        channel: "IN_APP" as const,
        templateCode: "BACKUP_PROMOTED",
        aggregateType: "INVITATION",
        aggregateId: B1_SEED_IDS.invitationD,
        payloadJson: { invitationId: B1_SEED_IDS.invitationD },
        status: "SENT" as const,
        attemptCount: 1,
        availableAt: respondedAt,
        sentAt: respondedAt,
        readAt: null,
        idempotencyKey: `seed:invitation:${B1_SEED_IDS.invitationD}:promoted`,
        lastError: null,
        createdAt: respondedAt,
        updatedAt: respondedAt,
      },
    ],
    statusEvents: [
      {
        id: B1_SEED_IDS.statusEvent,
        aggregateType: "INVITATION",
        aggregateId: B1_SEED_IDS.invitationD,
        eventType: "INVITATION_PROMOTED",
        actorUserId: null,
        fromStatus: "QUEUED",
        toStatus: "PENDING",
        payloadJson: { actorType: "SYSTEM" },
        idempotencyKey: `seed:invitation:${B1_SEED_IDS.invitationD}:promoted`,
        createdAt: respondedAt,
      },
    ],
    domainEvents: [
      {
        id: B1_SEED_IDS.domainEvent,
        schoolId: refs.schoolId,
        actorUserId: refs.userAId,
        eventType: "SESSION_COMPLETED",
        aggregateType: "SESSION",
        aggregateId: B1_SEED_IDS.session,
        requestId: refs.requestId,
        sessionId: B1_SEED_IDS.session,
        dataScope: "TEST" as const,
        payloadJson: {},
        dedupeKey: `seed:session:${B1_SEED_IDS.session}:completed`,
        occurredAt: endsAt,
        createdAt: endsAt,
      },
    ],
    opsWorkLogs: [
      {
        id: B1_SEED_IDS.opsWorkLog,
        opsUserId: refs.opsUserId,
        requestId: refs.requestId,
        sessionId: B1_SEED_IDS.session,
        actionType: "TEST_SUPPORT",
        minutesSpent: 5,
        note: "B1 TEST seed",
        createdAt: endsAt,
      },
    ],
    costItems: [
      {
        id: B1_SEED_IDS.costItem,
        schoolId: refs.schoolId,
        requestId: refs.requestId,
        sessionId: B1_SEED_IDS.session,
        costType: "TEST_MATERIAL",
        amountCents: 100,
        currency: "CNY",
        note: "B1 TEST seed",
        incurredAt: endsAt,
        createdAt: endsAt,
      },
    ],
  };
}
