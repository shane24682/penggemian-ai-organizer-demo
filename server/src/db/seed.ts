import "dotenv/config";

import { eq, inArray } from "drizzle-orm";

import { hashPassword } from "../auth/password.js";
import { loadConfig } from "../config.js";
import { createDatabase } from "./client.js";
import {
  requestRoleSlots,
  requests,
  schools,
  userAvailability,
  userCapabilities,
  userProfiles,
  users,
} from "./schema/index.js";

const IDS = {
  school: "10000000-0000-4000-8000-000000000001",
  userA: "20000000-0000-4000-8000-000000000001",
  userB: "20000000-0000-4000-8000-000000000002",
  userC: "20000000-0000-4000-8000-000000000003",
  userD: "20000000-0000-4000-8000-000000000004",
  request: "30000000-0000-4000-8000-000000000001",
  codingSlot: "40000000-0000-4000-8000-000000000001",
  writingSlot: "40000000-0000-4000-8000-000000000002",
} as const;

const config = loadConfig();
if (config.appEnv === "production") {
  throw new Error("Refusing to seed a production database");
}

const connection = createDatabase(config.databaseUrl, 1);
const passwordHash = await hashPassword("PenggemianTest!2026");
const now = new Date();
const startsAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
const applicationDeadline = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
const availabilityStartsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const availabilityEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

const people = [
  { id: IDS.userA, phone: "+8613800000001", name: "测试发起人A", major: "数学", hours: 12, role: "MODELING" as const, level: 4 },
  { id: IDS.userB, phone: "+8613800000002", name: "测试主选B", major: "计算机", hours: 14, role: "CODING" as const, level: 4 },
  { id: IDS.userC, phone: "+8613800000003", name: "测试主选C", major: "统计学", hours: 10, role: "WRITING" as const, level: 4 },
  { id: IDS.userD, phone: "+8613800000004", name: "测试候补D", major: "软件工程", hours: 12, role: "CODING" as const, level: 3 },
];

try {
  await connection.db.transaction(async (tx) => {
    await tx
      .insert(schools)
      .values({ id: IDS.school, code: "TEST-UNIVERSITY", name: "碰个面测试大学" })
      .onConflictDoUpdate({ target: schools.code, set: { name: "碰个面测试大学", updatedAt: new Date() } });

    for (const person of people) {
      await tx
        .insert(users)
        .values({ id: person.id, schoolId: IDS.school, phoneE164: person.phone, passwordHash })
        .onConflictDoUpdate({
          target: users.phoneE164,
          set: { schoolId: IDS.school, passwordHash, status: "ACTIVE", updatedAt: new Date() },
        });

      await tx
        .insert(userProfiles)
        .values({
          userId: person.id,
          displayName: person.name,
          majorCategory: person.major,
          gradeYear: 3,
          competitionTags: ["数学建模", "团队协作"],
          weeklyHours: person.hours,
          trustScore: 80,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            displayName: person.name,
            majorCategory: person.major,
            gradeYear: 3,
            competitionTags: ["数学建模", "团队协作"],
            weeklyHours: person.hours,
            updatedAt: new Date(),
          },
        });
    }

    const userIds = people.map((person) => person.id);
    await tx.delete(userAvailability).where(inArray(userAvailability.userId, userIds));
    await tx.delete(userCapabilities).where(inArray(userCapabilities.userId, userIds));

    await tx.insert(userAvailability).values(
      people.map((person) => ({
        userId: person.id,
        startsAt: availabilityStartsAt,
        endsAt: availabilityEndsAt,
      })),
    );

    await tx.insert(userCapabilities).values(
      people.map((person) => ({
        userId: person.id,
        roleCode: person.role,
        level: person.level,
        summary: `${person.role} 测试能力`,
        verificationStatus: "VERIFIED" as const,
      })),
    );

    await tx
      .insert(requests)
      .values({
        id: IDS.request,
        schoolId: IDS.school,
        creatorUserId: IDS.userA,
        competitionName: "全国大学生数学建模竞赛",
        title: "数模队伍招募编程与写作成员",
        description: "用于P0数据库和跨账号流程验收",
        startsAt,
        endsAt,
        weeklyHoursRequired: 8,
        participantLimit: 3,
        applicationDeadline,
        sourceChannel: "DIRECT",
        dataScope: "TEST",
      })
      .onConflictDoUpdate({
        target: requests.id,
        set: {
          startsAt,
          endsAt,
          applicationDeadline,
          status: "OPEN",
          updatedAt: new Date(),
        },
      });

    await tx.delete(requestRoleSlots).where(eq(requestRoleSlots.requestId, IDS.request));
    await tx.insert(requestRoleSlots).values([
      {
        id: IDS.codingSlot,
        requestId: IDS.request,
        roleCode: "CODING",
        slotCount: 1,
        minLevel: 3,
        evidenceRequired: true,
      },
      {
        id: IDS.writingSlot,
        requestId: IDS.request,
        roleCode: "WRITING",
        slotCount: 1,
        minLevel: 3,
        evidenceRequired: true,
      },
    ]);
  });

  console.log("Seed completed");
  console.log("Test password: PenggemianTest!2026");
  console.log(`Test request id: ${IDS.request}`);
} finally {
  await connection.close();
}
