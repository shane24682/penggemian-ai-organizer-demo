"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { P0ApiError } from "@/lib/p0-api";
import { pendingOperation, statusLabel, writeWorkflow } from "@/lib/p0-workflow";
import { getOpsDetail, getOpsFlows, getOpsMetrics, type OpsDetail, type OpsFilters, type OpsFlows, type OpsMetrics, type OpsRow } from "@/lib/p0-ops";
import styles from "./P0WorkflowPanel.module.css";

const message = (e: unknown) => e instanceof P0ApiError ? `${e.message}（${e.code}${e.requestId ? ` · ${e.requestId}` : ""}）` : e instanceof Error ? e.message : "操作失败";
const beijingInput = (date: Date) => new Date(date.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 16);
const instant = (value: string) => new Date(`${value}:00+08:00`).toISOString();
const views = ["需求", "邀请", "回应", "成局", "签到", "异常"] as const;
type ListView = typeof views[number];
function Records({ title, rows }: { title: string; rows: OpsRow[] }) {
  return <section className={styles.card}><h3>{title}（{rows.length}）</h3>{rows.length ? rows.map((row, index) => <details key={String(row.id || index)}><summary>{String(row.eventType || row.actionType || row.status || row.id || "记录")} {String(row.createdAt || row.startedAt || "")}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify(row, null, 2)}</pre></details>) : <p>暂无记录。</p>}</section>;
}
export default function P0OpsPanel() {
  const { user, accessToken } = useAuth();
  const [school, setSchool] = useState(user?.schoolId || "");
  const [channel, setChannel] = useState(""); const [status, setStatus] = useState(""); const [scope, setScope] = useState("REAL");
  const [from, setFrom] = useState(() => beijingInput(new Date(Date.now() - 30 * 86400_000)));
  const [to, setTo] = useState(() => beijingInput(new Date(Date.now() + 60_000)));
  const [view, setView] = useState<ListView>("需求");
  const [filters, setFilters] = useState<OpsFilters | null>(null);
  const [flows, setFlows] = useState<OpsFlows | null>(null); const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [detail, setDetail] = useState<OpsDetail | null>(null);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [metricError, setMetricError] = useState(""); const [notice, setNotice] = useState("");
  const [minutes, setMinutes] = useState("5"); const [amount, setAmount] = useState("0"); const [costType, setCostType] = useState("OTHER");
  const [reason, setReason] = useState(""); const [incurred, setIncurred] = useState(() => beijingInput(new Date()));
  const sequence = useRef(0); const lock = useRef(false); const detailSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { sequence.current += 1; detailSequence.current += 1; controller.current?.abort(); }, []);
  const load = async (selected: OpsFilters, cursor?: string) => {
    if (!user || user.role === "USER" || lock.current) return;
    const seq = ++sequence.current; ++detailSequence.current; controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(""); setMetricError(""); setDetail(null); setMetrics(null); setFlows(null);
    const metricRead = getOpsMetrics(accessToken, selected, abort.signal).then((data) => { if (seq === sequence.current) setMetrics(data); })
      .catch((e: unknown) => { if (seq === sequence.current && !abort.signal.aborted) setMetricError(message(e)); });
    try { const data = await getOpsFlows(accessToken, selected, cursor, abort.signal); if (seq === sequence.current) { setFlows(data); setFilters(selected); } }
    catch (e) { if (seq === sequence.current && !abort.signal.aborted) setError(message(e)); }
    finally { await metricRead; if (seq === sequence.current) setLoading(false); }
  };
  const open = async (id: string) => {
    if (!filters || lock.current) return;
    const seq = ++detailSequence.current; setLoading(true); setError(""); setDetail(null);
    try { const data = await getOpsDetail(accessToken, id, filters.schoolId); if (seq === detailSequence.current) setDetail(data); }
    catch (e) { if (seq === detailSequence.current) setError(message(e)); }
    finally { if (seq === detailSequence.current) setLoading(false); }
  };
  const record = async (actionType: "LOG_WORK" | "RECORD_COST") => {
    if (!user || !detail || !filters || lock.current || error) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    let pending: Awaited<ReturnType<typeof pendingOperation>> | undefined;
    try {
      const body = { actionType, requestId: detail.request.id, ...(detail.session ? { sessionId: detail.session.id } : {}), reason: reason.trim(),
        ...(actionType === "LOG_WORK" ? { minutesSpent: Number(minutes) } : { amountCents: Number(amount), costType, incurredAt: instant(incurred) }) };
      pending = await pendingOperation(user.id, "/api/v1/ops/actions", body, localStorage);
      await writeWorkflow(accessToken, "/api/v1/ops/actions", body, pending.key); pending.clear();
      setNotice("运营记录已入库，正在回读最新记录…");
      const [next, totals] = await Promise.all([getOpsDetail(accessToken, detail.request.id, filters.schoolId), getOpsMetrics(accessToken, filters)]);
      setDetail(next); setMetrics(totals);
      setNotice("运营记录已入库，已回读最新记录。");
    } catch (e) { if (e instanceof P0ApiError && e.status >= 400 && e.status < 500) pending?.clear(); setError(message(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!user || user.role === "USER") return <div className={styles.card}><h2>运营工作台</h2><p>仅运营和管理员账号可访问。普通用户没有运营查询或记录权限。</p></div>;
  return <div className={`workspace-view embedded-view ${styles.root}`}>
    <h2>运营工作台</h2><p>真实服务端流程；指标固定仅统计 REAL。列表按需求创建时间筛选，指标按 A5 各项事件口径计算。时间输入为北京时间，区间左闭右开。</p>
    <form className={styles.card} onSubmit={(e) => { e.preventDefault(); try {
      const a = instant(from); const b = instant(to); if (a >= b) throw new Error("结束时间必须晚于开始时间");
      if (new Date(b).getTime() - new Date(a).getTime() > 366 * 86400_000) throw new Error("查询范围不能超过 366 天");
      void load({ schoolId: school, sceneCode: "MATH_MODELING", sourceChannel: channel.trim() || undefined, status: status || undefined,
        dataScope: scope || undefined, from: a, to: b, exceptionsOnly: view === "异常" });
    } catch (e) { setError(message(e)); } }}>
      <label>学校 ID<input required value={school} readOnly={user.role === "OPS"} onChange={(e) => setSchool(e.target.value)}/></label>
      <label>场景<select aria-label="场景" disabled><option>数学建模 MATH_MODELING</option></select></label>
      <label>来源渠道<input value={channel} placeholder="全部 / DIRECT / REGROUP" onChange={(e) => setChannel(e.target.value)}/></label>
      <label>需求状态<select aria-label="需求状态" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">全部</option>{["DRAFT", "OPEN", "MATCHING", "INVITING", "FULFILLED", "CANCELLED", "EXPIRED"].map((s) => <option key={s}>{s}</option>)}</select></label>
      <label>列表数据范围<select aria-label="列表数据范围" value={scope} onChange={(e) => setScope(e.target.value)}>{["REAL", "TEST", "DEMO"].map((s) => <option key={s}>{s}</option>)}<option value="">全部</option></select></label>
      <label>开始时间<input type="datetime-local" required value={from} onChange={(e) => setFrom(e.target.value)}/></label>
      <label>结束时间<input type="datetime-local" required value={to} onChange={(e) => setTo(e.target.value)}/></label>
      <button disabled={loading || busy}>查询 / 刷新</button>
    </form>
    {loading && <p role="status">正在读取运营事实…</p>}{error && <p className={styles.error} role="alert">{error}；请重新查询或读取。</p>}{notice && <p className={styles.success} role="status">{notice}</p>}
    <section className={styles.card}><h3>四项核心指标（仅 REAL）</h3>{metricError && <p className={styles.error} role="alert">指标读取失败：{metricError}</p>}{metrics ? <>
      <p>学校 {metrics.filters.schoolId} · {metrics.filters.sceneCode} · 渠道 {metrics.filters.sourceChannel} · {metrics.filters.from} — {metrics.filters.to}</p>
      {([["成局率", metrics.formationRate], ["到场率", metrics.attendanceRate], ["复组率", metrics.regroupRate]] as const).map(([name, value]) => <p key={name}>{name}：{value.numerator}/{value.denominator} · {value.denominator ? `${(value.rate * 100).toFixed(2)}%` : "暂无可计算样本"}</p>)}
      <p>单位成本：{metrics.unitCost.completedSessions ? `${metrics.unitCost.amountCentsPerCompletedSession} 分/已完成局` : "暂无已完成样本"} · 总成本 {metrics.unitCost.totalAmountCents} 分 / {metrics.unitCost.completedSessions} 局</p>
      <p>直接成本 {metrics.unitCost.directCostCents} 分 + 运营 {metrics.unitCost.opsMinutes} 分钟 × 100 分/分钟 = 人工成本 {metrics.unitCost.laborCostCents} 分。币种 CNY。</p>
    </> : <p>查询后展示服务端指标，不使用测试记录或页面数据推算。</p>}</section>
    <nav className={styles.tabs} aria-label="运营列表导航">{views.map((name) => <button disabled={loading || busy} key={name} aria-pressed={view === name} onClick={() => { setView(name); if (filters) void load({ ...filters, exceptionsOnly: name === "异常" }); }}>{name}</button>)}</nav>
    {flows && <>
      {view !== "需求" && <><p>以下为当前需求游标页关联的真实记录，不是全量统计。</p>{view === "异常"
        ? Object.entries(flows.records.exceptions).map(([name, rows]) => <Records key={name} title={({ matching: "匹配失败", notifications: "通知失败 / DEAD", absent: "缺席", expiredInvitations: "邀请超时", overdueInvitations: "待超时任务处理" } as Record<string, string>)[name]} rows={rows}/>)
        : <Records title={`${view}列表`} rows={view === "邀请" ? flows.records.invitations : view === "回应" ? flows.records.responses : view === "成局" ? flows.records.sessions : flows.records.checkins}/>}</>}
      {flows.items.length ? flows.items.map((item) => <article key={item.requestId} className={styles.card}><h3>{item.title}</h3><p>{item.creator.displayName} · {item.dataScope} · {item.sourceChannel} · 需求 {item.requestStatus} · 活动 {item.session ? statusLabel(item.session.status) : "未建局"}</p><p>邀请 {item.counts.invitations} / 待回应 {item.counts.pendingInvitations} / 接受 {item.counts.acceptedInvitations} · 成员 {item.counts.members} · 到场 {item.counts.checkedIn} · 通知异常 {item.counts.failedNotifications}</p><code>{item.requestId}</code><button disabled={loading || busy} onClick={() => void open(item.requestId)}>追溯{view}与完整链路</button></article>) : <p className={styles.card}>当前筛选无结果。</p>}
      {flows.pagination.hasMore && <button disabled={loading || busy} onClick={() => { if (filters && flows.pagination.nextCursor) void load(filters, flows.pagination.nextCursor); }}>下一页（游标）</button>}</>}
    {detail && <>
      <section className={styles.card}><h3>完整轨迹：{detail.request.title}</h3><p>{detail.school.name} · {detail.request.status} · {detail.request.dataScope}</p>
        <form onSubmit={(e) => { e.preventDefault(); void record("LOG_WORK"); }}><label>处理原因 / 备注<textarea required maxLength={1000} disabled={busy} value={reason} onChange={(e) => setReason(e.target.value)}/></label><label>人工分钟<input type="number" required min="1" max="1440" step="1" disabled={busy} value={minutes} onChange={(e) => setMinutes(e.target.value)}/></label><button disabled={busy || Boolean(error)}>记录人工时间</button></form>
        <form onSubmit={(e) => { e.preventDefault(); void record("RECORD_COST"); }}><label>成本类型<input required maxLength={96} disabled={busy} value={costType} onChange={(e) => setCostType(e.target.value)}/></label><label>实际成本（整数分，CNY）<input type="number" required min="0" max="2147483647" step="1" disabled={busy} value={amount} onChange={(e) => setAmount(e.target.value)}/></label><label>发生时间（北京时间）<input type="datetime-local" required disabled={busy} value={incurred} onChange={(e) => setIncurred(e.target.value)}/></label><p>使用上述同一处理原因；记录只追加，不修改活动状态。</p><button disabled={busy || Boolean(error) || !reason.trim()}>记录实际成本</button></form>
      </section>
      <Records title="匹配批次及失败" rows={detail.matching.runs}/><Records title="邀请与回应（含拒绝 / 超时）" rows={detail.invitations}/>
      <Records title="成局成员" rows={detail.session?.members || []}/><Records title="签到与缺席" rows={detail.session?.checkins || []}/>
      <Records title="通知及异常" rows={detail.notifications}/><Records title="通知尝试" rows={detail.deliveryAttempts}/>
      <Records title="状态审计" rows={detail.events.status}/><Records title="业务事件" rows={detail.events.domain}/>
      <Records title="人工时间记录" rows={detail.operations.workLogs}/><Records title="实际成本记录" rows={detail.operations.costs}/>
    </>}
  </div>;
}
