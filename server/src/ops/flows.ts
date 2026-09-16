import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../db/client.js";
import {
  checkins,
  costItems,
  domainEvents,
  invitations,
  matchCandidates,
  matchRuns,
  notificationOutbox,
  opsWorkLogs,
  regroupIntents,
  requestRoleSlots,
  requests,
  reviews,
  schools,
  sessionMembers,
  sessions,
  statusEvents,
  userProfiles,
} from "../db/schema/index.js";
import { ApiError } from "../http/errors.js";

export type FlowFilters = {
  schoolId: string;
  sceneCode: "MATH_MODELING";
  sourceChannel?: string;
  status?: "DRAFT" | "OPEN" | "MATCHING" | "INVITING" | "FULFILLED" | "CANCELLED" | "EXPIRED";
  dataScope?: "REAL" | "TEST" | "DEMO";
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
};

type FlowRow = {
  request_id: string;
  creator_user_id: string;
  creator_display_name: string;
  title: string;
  request_status: FlowFilters["status"];
  source_channel: string;
  data_scope: "REAL" | "TEST" | "DEMO";
  starts_at: Date;
  ends_at: Date;
  created_at: Date;
  updated_at: Date;
  session_id: string | null;
  session_status: "FORMING" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | null;
  current_match_run_id: string | null;
  candidate_count: number | string;
  invitation_count: number | string;
  pending_invitation_count: number | string;
  accepted_invitation_count: number | string;
  member_count: number | string;
  checked_in_count: number | string;
  failed_notification_count: number | string;
  last_event_at: Date | null;
};

const asNumber = (value: number | string) => Number(value);

export const listOpsFlows = async (db: Database, filters: FlowFilters) => {
  const sourceChannelFilter = filters.sourceChannel
    ? sql`and r.source_channel = ${filters.sourceChannel}`
    : sql``;
  const statusFilter = filters.status ? sql`and r.status = ${filters.status}` : sql``;
  const dataScopeFilter = filters.dataScope ? sql`and r.data_scope = ${filters.dataScope}` : sql``;
  const fromFilter = filters.from
    ? sql`and r.created_at >= ${filters.from.toISOString()}::timestamptz`
    : sql``;
  const toFilter = filters.to
    ? sql`and r.created_at < ${filters.to.toISOString()}::timestamptz`
    : sql``;

  const rows = await db.execute<FlowRow>(sql`
    select
      r.id as request_id,
      r.creator_user_id,
      up.display_name as creator_display_name,
      r.title,
      r.status as request_status,
      r.source_channel,
      r.data_scope,
      r.starts_at,
      r.ends_at,
      r.created_at,
      r.updated_at,
      s.id as session_id,
      s.status as session_status,
      (
        select mr.id from match_runs mr
        where mr.request_id = r.id and mr.is_current = true
        order by mr.created_at desc limit 1
      ) as current_match_run_id,
      (select count(*) from match_candidates mc where mc.request_id = r.id) as candidate_count,
      (select count(*) from invitations i where i.request_id = r.id) as invitation_count,
      (select count(*) from invitations i where i.request_id = r.id and i.status = 'PENDING') as pending_invitation_count,
      (select count(*) from invitations i where i.request_id = r.id and i.status = 'ACCEPTED') as accepted_invitation_count,
      (select count(*) from session_members sm where sm.session_id = s.id) as member_count,
      (
        select count(*) from checkins c
        where c.session_id = s.id and c.status in ('PRESENT', 'LATE')
      ) as checked_in_count,
      (
        select count(*) from notification_outbox no
        where no.aggregate_id in (select i.id from invitations i where i.request_id = r.id)
          and no.status in ('FAILED', 'DEAD')
      ) as failed_notification_count,
      (select max(de.occurred_at) from domain_events de where de.request_id = r.id) as last_event_at
    from requests r
    join user_profiles up on up.user_id = r.creator_user_id
    left join sessions s on s.request_id = r.id
    where r.school_id = ${filters.schoolId}
      and r.scene_code = ${filters.sceneCode}
      and r.deleted_at is null
      ${sourceChannelFilter}
      ${statusFilter}
      ${dataScopeFilter}
      ${fromFilter}
      ${toFilter}
    order by r.created_at desc, r.id desc
    limit ${filters.limit + 1}
    offset ${filters.offset}
  `);

  const hasMore = rows.length > filters.limit;
  return {
    filters: {
      schoolId: filters.schoolId,
      sceneCode: filters.sceneCode,
      sourceChannel: filters.sourceChannel ?? "ALL",
      status: filters.status ?? "ALL",
      dataScope: filters.dataScope ?? "ALL",
      from: filters.from?.toISOString() ?? null,
      to: filters.to?.toISOString() ?? null,
    },
    pagination: { limit: filters.limit, offset: filters.offset, hasMore },
    items: rows.slice(0, filters.limit).map((row) => ({
      requestId: row.request_id,
      creator: { userId: row.creator_user_id, displayName: row.creator_display_name },
      title: row.title,
      requestStatus: row.request_status,
      sourceChannel: row.source_channel,
      dataScope: row.data_scope,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      session: row.session_id ? { id: row.session_id, status: row.session_status } : null,
      currentMatchRunId: row.current_match_run_id,
      counts: {
        candidates: asNumber(row.candidate_count),
        invitations: asNumber(row.invitation_count),
        pendingInvitations: asNumber(row.pending_invitation_count),
        acceptedInvitations: asNumber(row.accepted_invitation_count),
        members: asNumber(row.member_count),
        checkedIn: asNumber(row.checked_in_count),
        failedNotifications: asNumber(row.failed_notification_count),
      },
      lastEventAt: row.last_event_at,
    })),
  };
};

export const getOpsFlowDetail = async (db: Database, requestId: string, schoolId: string) => {
  const [request] = await db
    .select({
      request: requests,
      school: { id: schools.id, code: schools.code, name: schools.name },
      creatorDisplayName: userProfiles.displayName,
    })
    .from(requests)
    .innerJoin(schools, eq(schools.id, requests.schoolId))
    .innerJoin(userProfiles, eq(userProfiles.userId, requests.creatorUserId))
    .where(and(eq(requests.id, requestId), eq(requests.schoolId, schoolId)))
    .limit(1);
  if (!request || request.request.deletedAt) {
    throw new ApiError(404, "FLOW_NOT_FOUND", "流程不存在");
  }

  const roleSlots = await db
    .select()
    .from(requestRoleSlots)
    .where(eq(requestRoleSlots.requestId, requestId))
    .orderBy(asc(requestRoleSlots.createdAt));
  const runs = await db
    .select()
    .from(matchRuns)
    .where(eq(matchRuns.requestId, requestId))
    .orderBy(desc(matchRuns.createdAt));
  const candidates = await db
    .select()
    .from(matchCandidates)
    .where(eq(matchCandidates.requestId, requestId))
    .orderBy(asc(matchCandidates.roleSlotId), asc(matchCandidates.rank));
  const [session] = await db.select().from(sessions).where(eq(sessions.requestId, requestId)).limit(1);
  const invitationRows = await db
    .select()
    .from(invitations)
    .where(eq(invitations.requestId, requestId))
    .orderBy(asc(invitations.roleSlotId), asc(invitations.queuePosition));
  const invitationIds = invitationRows.map(({ id }) => id);
  const members = session
    ? await db
        .select({ member: sessionMembers, displayName: userProfiles.displayName })
        .from(sessionMembers)
        .innerJoin(userProfiles, eq(userProfiles.userId, sessionMembers.userId))
        .where(eq(sessionMembers.sessionId, session.id))
        .orderBy(asc(sessionMembers.joinedAt))
    : [];
  const checkinRows = session
    ? await db.select().from(checkins).where(eq(checkins.sessionId, session.id)).orderBy(asc(checkins.createdAt))
    : [];
  const reviewRows = session
    ? await db.select().from(reviews).where(eq(reviews.sessionId, session.id)).orderBy(asc(reviews.createdAt))
    : [];
  const regroupRows = session
    ? await db
        .select()
        .from(regroupIntents)
        .where(eq(regroupIntents.sessionId, session.id))
        .orderBy(asc(regroupIntents.createdAt))
    : [];
  const aggregateIds = [requestId, ...(session ? [session.id] : []), ...invitationIds];
  const statusEventRows = await db
    .select()
    .from(statusEvents)
    .where(inArray(statusEvents.aggregateId, aggregateIds))
    .orderBy(asc(statusEvents.createdAt));
  const domainEventRows = await db
    .select()
    .from(domainEvents)
    .where(eq(domainEvents.requestId, requestId))
    .orderBy(asc(domainEvents.occurredAt));
  const notifications = invitationIds.length
    ? await db
        .select()
        .from(notificationOutbox)
        .where(inArray(notificationOutbox.aggregateId, invitationIds))
        .orderBy(asc(notificationOutbox.createdAt))
    : [];
  const workLogs = await db
    .select()
    .from(opsWorkLogs)
    .where(eq(opsWorkLogs.requestId, requestId))
    .orderBy(asc(opsWorkLogs.createdAt));
  const costs = await db
    .select()
    .from(costItems)
    .where(eq(costItems.requestId, requestId))
    .orderBy(asc(costItems.incurredAt));

  return {
    request: { ...request.request, creatorDisplayName: request.creatorDisplayName },
    school: request.school,
    roleSlots,
    matching: { runs, candidates },
    session: session ? { ...session, members, checkins: checkinRows, reviews: reviewRows, regroupIntents: regroupRows } : null,
    invitations: invitationRows,
    notifications,
    events: { status: statusEventRows, domain: domainEventRows },
    operations: { workLogs, costs },
  };
};
