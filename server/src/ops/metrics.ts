import { sql } from "drizzle-orm";

import type { Database } from "../db/client.js";

export type MetricsFilters = {
  schoolId: string;
  sceneCode: "MATH_MODELING";
  sourceChannel?: string;
  from: Date;
  to: Date;
};

type MetricsRow = {
  formation_numerator: number | string;
  formation_denominator: number | string;
  attendance_numerator: number | string;
  attendance_denominator: number | string;
  regroup_numerator: number | string;
  regroup_denominator: number | string;
  direct_cost_cents: number | string;
  ops_minutes: number | string;
  completed_sessions: number | string;
};

const asNumber = (value: number | string) => Number(value);
const rate = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));

export const getOpsMetrics = async (db: Database, filters: MetricsFilters) => {
  const fromIso = filters.from.toISOString();
  const toIso = filters.to.toISOString();
  const sourceChannelFilter = filters.sourceChannel
    ? sql`and r.source_channel = ${filters.sourceChannel}`
    : sql``;

  const rows = await db.execute<MetricsRow>(sql`
    with request_cohort as (
      select r.id, r.created_at
      from requests r
      where r.school_id = ${filters.schoolId}
        and r.scene_code = ${filters.sceneCode}
        and r.data_scope = 'REAL'
        and r.deleted_at is null
        and r.created_at >= ${fromIso}::timestamptz
        and r.created_at < ${toIso}::timestamptz
        ${sourceChannelFilter}
    ),
    formation as (
      select
        count(*) filter (
          where exists (
            select 1
            from status_events se
            where se.aggregate_type = 'REQUEST'
              and se.aggregate_id = rc.id
              and se.event_type = 'REQUEST_FULFILLED'
              and se.created_at >= rc.created_at
              and se.created_at <= rc.created_at + interval '72 hours'
          )
        ) as numerator,
        count(*) as denominator
      from request_cohort rc
    ),
    confirmed_cohort as (
      select se.aggregate_id as session_id, min(se.created_at) as confirmed_at
      from status_events se
      join sessions s on s.id = se.aggregate_id
      join requests r on r.id = s.request_id
      where se.aggregate_type = 'SESSION'
        and se.event_type = 'SESSION_CONFIRMED'
        and se.created_at >= ${fromIso}::timestamptz
        and se.created_at < ${toIso}::timestamptz
        and r.school_id = ${filters.schoolId}
        and r.scene_code = ${filters.sceneCode}
        and r.data_scope = 'REAL'
        and r.deleted_at is null
        ${sourceChannelFilter}
      group by se.aggregate_id
    ),
    attendance as (
      select
        count(sm.id) filter (where c.status in ('PRESENT', 'LATE')) as numerator,
        count(sm.id) as denominator
      from confirmed_cohort cc
      join session_members sm on sm.session_id = cc.session_id
      left join checkins c on c.session_id = sm.session_id and c.user_id = sm.user_id
    ),
    completed_cohort as (
      select
        se.aggregate_id as session_id,
        s.request_id,
        min(se.created_at) as completed_at
      from status_events se
      join sessions s on s.id = se.aggregate_id
      join requests r on r.id = s.request_id
      where se.aggregate_type = 'SESSION'
        and se.event_type = 'SESSION_COMPLETED'
        and se.created_at >= ${fromIso}::timestamptz
        and se.created_at < ${toIso}::timestamptz
        and r.school_id = ${filters.schoolId}
        and r.scene_code = ${filters.sceneCode}
        and r.data_scope = 'REAL'
        and r.deleted_at is null
        ${sourceChannelFilter}
      group by se.aggregate_id, s.request_id
    ),
    regroup as (
      select
        count(*) filter (
          where exists (
            select 1
            from requests next_request
            where next_request.source_session_id = cc.session_id
              and next_request.data_scope = 'REAL'
              and next_request.deleted_at is null
              and next_request.created_at >= cc.completed_at
              and next_request.created_at <= cc.completed_at + interval '7 days'
          )
        ) as numerator,
        count(*) as denominator
      from completed_cohort cc
    ),
    costs as (
      select
        coalesce(sum((
          select coalesce(sum(ci.amount_cents), 0)
          from cost_items ci
          where ci.session_id = cc.session_id
             or (ci.session_id is null and ci.request_id = cc.request_id)
        )), 0) as direct_cost_cents,
        coalesce(sum((
          select coalesce(sum(owl.minutes_spent), 0)
          from ops_work_logs owl
          where owl.session_id = cc.session_id
             or (owl.session_id is null and owl.request_id = cc.request_id)
        )), 0) as ops_minutes,
        count(*) as completed_sessions
      from completed_cohort cc
    )
    select
      formation.numerator as formation_numerator,
      formation.denominator as formation_denominator,
      attendance.numerator as attendance_numerator,
      attendance.denominator as attendance_denominator,
      regroup.numerator as regroup_numerator,
      regroup.denominator as regroup_denominator,
      costs.direct_cost_cents,
      costs.ops_minutes,
      costs.completed_sessions
    from formation, attendance, regroup, costs
  `);

  const row = rows[0];
  const formationNumerator = asNumber(row.formation_numerator);
  const formationDenominator = asNumber(row.formation_denominator);
  const attendanceNumerator = asNumber(row.attendance_numerator);
  const attendanceDenominator = asNumber(row.attendance_denominator);
  const regroupNumerator = asNumber(row.regroup_numerator);
  const regroupDenominator = asNumber(row.regroup_denominator);
  const directCostCents = asNumber(row.direct_cost_cents);
  const opsMinutes = asNumber(row.ops_minutes);
  const completedSessions = asNumber(row.completed_sessions);
  const totalAmountCents = directCostCents + opsMinutes * 100;

  return {
    filters: {
      schoolId: filters.schoolId,
      sceneCode: filters.sceneCode,
      sourceChannel: filters.sourceChannel ?? "ALL",
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      dataScope: "REAL" as const,
    },
    formationRate: {
      numerator: formationNumerator,
      denominator: formationDenominator,
      rate: rate(formationNumerator, formationDenominator),
    },
    attendanceRate: {
      numerator: attendanceNumerator,
      denominator: attendanceDenominator,
      rate: rate(attendanceNumerator, attendanceDenominator),
    },
    regroupRate: {
      numerator: regroupNumerator,
      denominator: regroupDenominator,
      rate: rate(regroupNumerator, regroupDenominator),
    },
    unitCost: {
      directCostCents,
      opsMinutes,
      laborCostCents: opsMinutes * 100,
      totalAmountCents,
      completedSessions,
      amountCentsPerCompletedSession:
        completedSessions === 0 ? 0 : Math.round(totalAmountCents / completedSessions),
      currency: "CNY" as const,
    },
  };
};
