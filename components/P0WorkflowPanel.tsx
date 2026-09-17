"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentMatching, login, P0ApiError, runMatching, type PersistedMatchRun } from "@/lib/p0-api";
import {
  invitationExplanation, loadWorkflowSnapshot, pendingOperation, P0_TOKEN_KEY,
  startWorkflowPolling, statusLabel, writeWorkflow,
  type SessionBundle, type WorkflowSnapshot,
} from "@/lib/p0-workflow";
import styles from "./P0WorkflowPanel.module.css";

const tabs = { invitations: "我的邀请", backups: "候补进度", sessions: "我的成局", history: "活动历史", requests: "我的需求", notifications: "站内通知" } as const;
type Tab = keyof typeof tabs;
const formatTime = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) : "—";
const errorMessage = (error: unknown) => error instanceof P0ApiError
  ? `${error.message}（${error.code}${error.requestId ? ` · ${error.requestId}` : ""}）`
  : error instanceof Error ? `${error.message}；请检查网络后重试` : "操作失败，请重试";
const localTime = (date: Date) => new Date(date.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 16);

type Execute = (path: string, body: unknown, success: string) => Promise<boolean>;

function Fulfillment({ detail, userId, busy, execute }: { detail: SessionBundle; userId: string; busy: boolean; execute: Execute }) {
  const { session, checkins, reviews, regroup } = detail;
  const own = session.members.find((member) => member.userId === userId);
  const completed = session.status === "COMPLETED" && own?.memberStatus === "COMPLETED";
  const targets = session.members.filter((member) => member.userId !== userId && member.memberStatus === "COMPLETED");
  const [target, setTarget] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [draftChoices, setDraftChoices] = useState<string[] | null>(null);
  const choices = draftChoices ?? regroup.intent?.willingUserIdsJson ?? [];
  const [nextStart, setNextStart] = useState(() => localTime(new Date(Date.now() + 72 * 60 * 60_000)));
  const base = `/api/v1/sessions/${session.id}`;
  return <>
    <section className={styles.card} aria-label="签到">
      <h3>签到与到场</h3>
      <p>开放：{formatTime(checkins.opensAt)} · 截止：{formatTime(checkins.closesAt)}</p>
      <p>超过 {formatTime(checkins.lateAfter)} 签到记为迟到，结果由服务端确定。</p>
      <ul>{session.members.map((member) => {
        const record = checkins.records.find((item) => item.userId === member.userId);
        return <li key={member.userId}>{member.displayName}：{record ? `${statusLabel(record.status)} · ${formatTime(record.checkedInAt)}` : "尚无签到记录"}</li>;
      })}</ul>
      <button disabled={busy || !checkins.eligible} onClick={() => { void execute(`${base}/checkins`, {}, "签到已确认并保存"); }}>确认本人到场</button>
      {!checkins.eligible && <p>当前不可签到：{checkins.records.some((row) => row.userId === userId) ? "已有本人签到/缺席记录" : checkins.reason === "CHECKIN_WINDOW_CLOSED" ? "尚未开放或已超过截止时间" : "当前活动或成员状态不允许签到"}</p>}
    </section>
    <section className={styles.card} aria-label="私人评价">
      <h3>我的私人评价</h3><p>只显示本人提交的评价，不影响匹配分数。</p>
      {reviews.length ? <ul>{reviews.map((review) => <li key={review.id}>{session.members.find((member) => member.userId === review.revieweeUserId)?.displayName || review.revieweeUserId} · {review.rating}/5 · {review.comment || "无文字评价"}</li>)}</ul> : <p>暂无本人提交的评价。</p>}
      {completed ? <form onSubmit={(event) => {
        event.preventDefault();
        void execute(`${base}/reviews`, { revieweeUserId: target, rating, tags: [], comment: comment.trim() || null }, "评价已保存")
          .then((ok) => { if (ok) { setTarget(""); setComment(""); } });
      }}>
        <label>评价对象<select aria-label="评价对象" required value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)}><option value="">选择已到场成员</option>{targets.filter((member) => !reviews.some((review) => review.revieweeUserId === member.userId)).map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
        <label>评分<select aria-label="评分" value={rating} disabled={busy} onChange={(event) => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} 分</option>)}</select></label>
        <label>评价（可选）<textarea value={comment} maxLength={1000} disabled={busy} onChange={(event) => setComment(event.target.value)}/></label>
        <button disabled={busy || !target} type="submit">提交一次评价</button>
      </form> : <p>活动完成后，已到场成员才可提交评价。</p>}
    </section>
    <section className={styles.card} aria-label="复组意愿">
      <h3>复组意愿</h3><p>服务端状态：{regroup.intent ? statusLabel(regroup.intent.status) : "尚未提交"}。单向选择不公开，双方互选才可创建新需求。</p>
      {completed && <form onSubmit={(event) => { event.preventDefault(); void execute(`${base}/regroup-intents`, { willingUserIds: choices }, "复组意愿已保存").then((ok) => { if (ok) setDraftChoices(null); }); }}>
        <fieldset disabled={busy}><legend>愿意再次同局的已到场成员</legend>{targets.map((member) => <label className={styles.checkbox} key={member.userId}><input type="checkbox" checked={choices.includes(member.userId)} onChange={(event) => setDraftChoices(event.target.checked ? [...choices, member.userId] : choices.filter((id) => id !== member.userId))}/>{member.displayName}</label>)}</fieldset>
        <button disabled={busy || regroup.intent?.status === "CLOSED"}>保存意愿（可清空）</button>
      </form>}
      <p>双方有意愿：{regroup.mutualUserIds.length ? regroup.mutualUserIds.map((id) => session.members.find((member) => member.userId === id)?.displayName || id).join("、") : "暂无"}</p>
      {completed && <form onSubmit={(event) => {
        event.preventDefault();
        const startsAt = new Date(`${nextStart}:00+08:00`);
        if (Number.isNaN(startsAt.getTime())) return;
        void execute(`${base}/regroup`, {
          startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 2 * 60 * 60_000).toISOString(),
          applicationDeadline: new Date(startsAt.getTime() - 24 * 60 * 60_000).toISOString(),
        }, "复组需求已保存，可在“我的需求”查看并运行匹配");
      }}>
        <label>新启动会时间（北京时间）<input type="datetime-local" required value={nextStart} disabled={busy} onChange={(event) => setNextStart(event.target.value)}/></label>
        <p>启动会持续 2 小时，报名截止为开始前 24 小时；不会自动替其他成员接受邀请。</p>
        <button disabled={busy || !regroup.mutualUserIds.length}>创建复组需求</button>
      </form>}
    </section>
  </>;
}

export default function P0WorkflowPanel({ initialTab = "invitations" }: { initialTab?: Tab }) {
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [sessionId, setSessionId] = useState("");
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [matchRun, setMatchRun] = useState<PersistedMatchRun | null>(null);
  const lock = useRef(false);
  const activeToken = useRef("");
  const readSequence = useRef(0);

  const changeAuth = useCallback((value: string, preserveSelection = false) => {
    activeToken.current = value; setToken(value); setSnapshot(null); setSessionId(""); setMatchRun(null); setNotice("");
    if (!preserveSelection) {
      const url = new URL(window.location.href); url.searchParams.delete("session");
      window.history.replaceState(null, "", url);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(P0_TOKEN_KEY) || "";
        changeAuth(saved, true);
        const url = new URL(window.location.href);
        const selected = url.searchParams.get("session") || "";
        if (/^[a-f0-9-]{36}$/i.test(selected)) setSessionId(selected);
        const savedTab = url.searchParams.get("p0tab");
        if (savedTab && savedTab in tabs) setTab(savedTab as Tab);
      } catch { setActionError("浏览器存储不可用，请允许本站保存登录凭证后重试"); }
      setLoading(false);
    }, 0);
    const onStorage = (event: StorageEvent) => { if (event.key === P0_TOKEN_KEY || event.key === null) changeAuth(event.newValue || ""); };
    window.addEventListener("storage", onStorage);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", onStorage); activeToken.current = ""; };
  }, [changeAuth]);

  const refresh = useCallback(async (signal: AbortSignal) => {
    if (!token) return;
    const sequence = ++readSequence.current;
    try {
      const data = await loadWorkflowSnapshot(token, sessionId, signal);
      if (signal.aborted || token !== activeToken.current || sequence !== readSequence.current) return;
      setSnapshot(data); setLoadError(""); setLoading(false);
    } catch (error) {
      if (signal.aborted || token !== activeToken.current || sequence !== readSequence.current) return;
      if (error instanceof P0ApiError && error.status === 401) {
        localStorage.removeItem(P0_TOKEN_KEY); changeAuth(""); setActionError("登录已过期，请重新登录");
      } else { setLoadError(errorMessage(error)); setLoading(false); }
    }
  }, [token, sessionId, changeAuth]);
  useEffect(() => { if (token) return startWorkflowPolling(refresh); }, [token, refresh]);

  const select = (id: string, nextTab = tab) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("session", id); else url.searchParams.delete("session");
    url.searchParams.set("p0", "1"); url.searchParams.set("p0tab", nextTab);
    window.history.replaceState(null, "", url);
    setSessionId(id); setTab(nextTab); setActionError(""); setMatchRun(null);
    if (id !== sessionId) {
      setLoading(Boolean(token)); setSnapshot((current) => current ? { ...current, detail: null } : null);
    }
  };

  const execute: Execute = async (path, body, success) => {
    if (!snapshot || !token || lock.current || loadError) return false;
    lock.current = true; setBusy(true); setActionError(""); setNotice("");
    let pending: Awaited<ReturnType<typeof pendingOperation>> | undefined;
    try {
      pending = await pendingOperation(snapshot.user.id, path, body, localStorage);
      await writeWorkflow(token, path, body, pending.key);
      pending.clear();
      if (activeToken.current !== token) return false;
      setNotice(success); await refresh(new AbortController().signal); return true;
    } catch (error) {
      if (error instanceof P0ApiError && error.status >= 400 && error.status < 500) pending?.clear();
      if (activeToken.current === token) { setActionError(errorMessage(error)); await refresh(new AbortController().signal); }
      return false;
    } finally { lock.current = false; setBusy(false); }
  };

  return <div className={`workspace-view embedded-view ${styles.root}`}>
    <header className={styles.heading}><div><small>P0 · PostgreSQL 真实共享数据</small><h2>数模活动工作台</h2><p>不同设备登录各自账号即可回应邀请；状态每 5 秒回读，后台降为每分钟。</p></div>{token && <button disabled={busy} onClick={() => { localStorage.removeItem(P0_TOKEN_KEY); changeAuth(""); select(""); }}>退出账号</button>}</header>
    {actionError && <p className={styles.error} role="alert">{actionError}</p>}
    {notice && <p className={styles.success} role="status">{notice}</p>}
    {!token ? <form className={styles.card} onSubmit={(event) => {
      event.preventDefault(); if (lock.current) return;
      lock.current = true; setBusy(true); setActionError("");
      void login(phone.trim(), password).then((auth) => {
        localStorage.setItem(P0_TOKEN_KEY, auth.accessToken); setPassword(""); changeAuth(auth.accessToken); setLoading(true);
      }).catch((error: unknown) => setActionError(errorMessage(error))).finally(() => { lock.current = false; setBusy(false); });
    }}><h3>登录你的校园账号</h3><label>手机号<input required value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="username" inputMode="tel" placeholder="+8613800000002"/></label><label>密码<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password"/></label><button disabled={busy}>{busy ? "正在登录…" : "登录并从数据库恢复"}</button><p>使用自己的账号。手机号、密码不会写入活动记录或页面缓存。</p></form> : <>
      <p>当前用户：{snapshot?.user.displayName || "正在验证登录身份…"}</p>
      <nav className={styles.tabs} aria-label="数模业务导航">{(Object.keys(tabs) as Tab[]).map((name) => <button key={name} aria-pressed={tab === name} disabled={busy} onClick={() => select("", name)}>{tabs[name]}</button>)}</nav>
      {loadError && <div className={styles.error} role="alert">读取失败：{loadError}。{snapshot ? "以下为上次读取结果，不代表最新状态；写操作已禁用。" : "未读取成功，不显示模拟数据。"}<button onClick={() => { setLoading(true); void refresh(new AbortController().signal); }}>重新读取</button>{sessionId && <button onClick={() => select("")}>返回列表</button>}</div>}
      {loading && <p role="status">正在从服务端恢复状态…</p>}
      {snapshot && <>
        {sessionId ? <>
          <button disabled={busy} onClick={() => select("")}>← 返回列表</button>
          {snapshot.detail && <>
            <section className={styles.card}><h3>{snapshot.detail.session.title}</h3><b>{statusLabel(snapshot.detail.session.status)}</b><p>{formatTime(snapshot.detail.session.startsAt)} — {formatTime(snapshot.detail.session.endsAt)}</p><code>sessionId: {snapshot.detail.session.id}</code><ul>{snapshot.detail.session.members.map((member) => <li key={member.userId}>{member.displayName} · {member.memberType === "HOST" ? "发起人" : "参与者"} · {statusLabel(member.memberStatus)}</li>)}</ul></section>
            <Fulfillment key={`${snapshot.user.id}:${sessionId}`} detail={snapshot.detail} userId={snapshot.user.id} busy={busy || Boolean(loadError)} execute={execute}/>
          </>}
        </> : <>
          {(tab === "invitations" || tab === "backups") && (() => {
            const list = snapshot.invitations.filter((invitation) => tab !== "backups" || invitation.candidateType === "BACKUP");
            return list.length ? list.map((invitation) => <article className={styles.card} key={invitation.id}><h3>{invitation.requestTitle}</h3><b>{statusLabel(invitation.status)}</b><p>{invitationExplanation(invitation)}</p><p>{formatTime(invitation.startsAt)} · 排名位置 {invitation.queuePosition} · 截止 {formatTime(invitation.expiresAt)}</p>{invitation.status === "PENDING" && <div className={styles.actions}><button disabled={busy || Boolean(loadError)} onClick={() => { void execute(`/api/v1/invitations/${invitation.id}/respond`, { action: "ACCEPT" }, "邀请接受结果已保存，请在我的成局查看"); }}>接受邀请</button><button disabled={busy || Boolean(loadError)} onClick={() => { void execute(`/api/v1/invitations/${invitation.id}/respond`, { action: "DECLINE" }, "拒绝结果已保存，候补由服务端递补"); }}>拒绝邀请</button></div>}{invitation.status === "ACCEPTED" && <button disabled={busy} onClick={() => select(invitation.sessionId, "sessions")}>查看真实成局</button>}</article>) : <p className={styles.card}>{tab === "backups" ? "暂无候补邀请。" : "暂无收到的邀请。"}</p>;
          })()}
          {(tab === "sessions" || tab === "history") && (snapshot.sessions.filter((session) => tab !== "history" || ["COMPLETED", "CANCELLED"].includes(session.status)).length ? snapshot.sessions.filter((session) => tab !== "history" || ["COMPLETED", "CANCELLED"].includes(session.status)).map((session) => <article key={session.id} className={styles.card}><h3>{session.title}</h3><b>{statusLabel(session.status)} · 本人成员状态：{statusLabel(session.memberStatus)}</b><p>{formatTime(session.startsAt)} — {formatTime(session.endsAt)}</p><button disabled={busy} onClick={() => select(session.id)}>查看成员、签到与复组</button></article>) : <p className={styles.card}>{tab === "history" ? "暂无已完成或已取消的活动历史。" : "暂无本人加入的成局。"}</p>)}
          {tab === "requests" && <>
            {snapshot.requests.length ? snapshot.requests.map((item) => <article key={item.id} className={styles.card}><h3>{item.title}</h3><p>{item.status} · {formatTime(item.startsAt)}</p><code>{item.id}</code><div className={styles.actions}><button disabled={busy || Boolean(loadError)} onClick={() => {
              if (lock.current) return; lock.current = true; setBusy(true); setActionError("");
              void getCurrentMatching(token, item.id).then(setMatchRun).catch((error: unknown) => setActionError(errorMessage(error))).finally(() => { lock.current = false; setBusy(false); });
            }}>读取已保存匹配结果</button>{item.status === "OPEN" && <button disabled={busy || Boolean(loadError)} onClick={() => {
              if (lock.current) return; lock.current = true; setBusy(true); setActionError("");
              void runMatching(token, item.id).then(() => getCurrentMatching(token, item.id)).then((result) => { setMatchRun(result); return refresh(new AbortController().signal); }).catch((error: unknown) => setActionError(errorMessage(error))).finally(() => { lock.current = false; setBusy(false); });
            }}>运行真实匹配</button>}</div></article>) : <p className={styles.card}>暂无本人发布的需求，可从数学建模匹配入口发布。</p>}
            {matchRun && <section className={styles.card}><h3>数据库匹配回读</h3><code>{matchRun.id}</code><p>{matchRun.algorithmVersion} · {matchRun.candidateCount} 位候选人</p><ul>{matchRun.candidates.map((candidate) => <li key={candidate.id}>{candidate.displayName} · {candidate.candidateType === "PRIMARY" ? "主选" : "候补"} · {candidate.score} 分 · {candidate.reasons.join("、")}</li>)}</ul></section>}
          </>}
          {tab === "notifications" && (snapshot.notifications.length ? snapshot.notifications.map((notification) => <article key={notification.id} className={styles.card}><h3>组队邀请通知</h3><p>{formatTime(notification.sentAt)} · {notification.readAt ? "已读" : "未读"}</p><button disabled={busy || Boolean(loadError) || Boolean(notification.readAt)} onClick={() => { void execute(`/api/v1/me/notifications/${notification.id}/read`, {}, "通知已标记为已读"); }}>标记已读</button><button disabled={busy} onClick={() => select("", "invitations")}>查看邀请最新状态</button></article>) : <p className={styles.card}>暂无已投递的站内通知，邀请可直接在“我的邀请”查看。</p>)}
        </>}
      </>}
    </>}
  </div>;
}
