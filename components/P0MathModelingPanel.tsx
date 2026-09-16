"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  ApiRequestError,
  cancelPublishedRequest,
  getCurrentMatching,
  getMyRequests,
  login,
  publishMathModelingRequest,
  runMatching,
  type PersistedMatchRun,
} from "@/lib/p0-api";

type Props = {
  startsAtValue: string;
  weeklyHours: number;
  onBack: () => void;
  onNotify: (message: string) => void;
};

const TOKEN_KEY = "penggemian-p0-access-token";

const roleName = (candidate: PersistedMatchRun["candidates"][number]) => {
  const roleReason = candidate.breakdown.find((item) => item.key === "role")?.detail || "能力符合角色要求";
  if (roleReason.startsWith("CODING")) return "编程";
  if (roleReason.startsWith("WRITING")) return "论文写作";
  if (roleReason.startsWith("MODELING")) return "建模";
  return "灵活补位";
};

export default function P0MathModelingPanel({ startsAtValue, weeklyHours, onBack, onNotify }: Props) {
  const [phone, setPhone] = useState("+8613800000001");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<"idle" | "restoring" | "working" | "done">("restoring");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [matchRun, setMatchRun] = useState<PersistedMatchRun | null>(null);
  const [accessToken, setAccessToken] = useState("");

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const token = localStorage.getItem(TOKEN_KEY) || "";
      if (!token) {
        if (active) setPhase("idle");
        return;
      }
      setAccessToken(token);
      try {
        const ownRequests = await getMyRequests(token);
        const latest = ownRequests.find((item) => item.competitionName === "全国大学生数学建模竞赛");
        if (!latest) {
          if (active) setPhase("idle");
          return;
        }
        const persisted = await getCurrentMatching(token, latest.id);
        if (!active) return;
        setRequestId(latest.id);
        setRequestStatus(latest.status);
        setMatchRun(persisted);
        setPhase("done");
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiRequestError && caught.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setAccessToken("");
        }
        setPhase("idle");
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== "done" || !accessToken || !requestId || requestStatus === "CANCELLED") return;
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const persisted = await getCurrentMatching(accessToken, requestId);
        if (active) setMatchRun(persisted);
      } catch {
        // The last successfully loaded database state stays visible during a transient refresh failure.
      }
    };
    const intervalId = window.setInterval(() => void refresh(), 5_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [accessToken, phase, requestId, requestStatus]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setPhase("working");
    try {
      const startsAt = new Date(startsAtValue);
      if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now() + 24 * 60 * 60 * 1000) {
        throw new Error("首次启动会至少安排在 24 小时后");
      }
      const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
      const session = await login(phone.trim(), password);
      localStorage.setItem(TOKEN_KEY, session.accessToken);
      setAccessToken(session.accessToken);
      const published = await publishMathModelingRequest(session.accessToken, {
        title: "数模队伍招募编程与写作成员",
        startsAt,
        endsAt,
        weeklyHoursRequired: weeklyHours,
      });
      setRequestId(published.id);
      setRequestStatus(published.status);
      await runMatching(session.accessToken, published.id);
      const persisted = await getCurrentMatching(session.accessToken, published.id);
      setMatchRun(persisted);
      setRequestStatus(persisted.candidateCount > 0 ? "INVITING" : "OPEN");
      setPhase("done");
      onNotify(`真实需求已发布，已保存 ${persisted.candidateCount} 位候选人`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布或匹配失败");
      setPhase("idle");
    }
  };

  const cancelCurrent = async () => {
    if (!accessToken || !requestId) return;
    setError("");
    try {
      const cancelled = await cancelPublishedRequest(accessToken, requestId);
      setRequestStatus(cancelled.status);
      onNotify("需求及尚未结束的邀请已取消");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取消需求失败");
    }
  };

  return <div className="panel p0-match-panel">
    <div className="p0-match-head">
      <div><span>P0 · REAL DATA FLOW</span><h3>发布真实数模组队需求</h3><p>发起人默认承担建模岗，系统从 PostgreSQL 筛选编程和论文写作候选人。</p></div>
      <b>真实数据库</b>
    </div>

    {phase === "restoring" ? <div className="p0-empty">正在从 PostgreSQL 恢复上次需求和匹配结果…</div> : phase !== "done" ? <form onSubmit={submit}>
      <div className="p0-login-grid">
        <label>发起人手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+8613800000001" autoComplete="username" /></label>
        <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入账号密码" autoComplete="current-password" /></label>
      </div>
      <div className="p0-frozen-summary">
        <div><small>场景</small><b>全国大学生数学建模竞赛</b></div>
        <div><small>首次启动会</small><b>{new Date(startsAtValue).toLocaleString("zh-CN", { hour12: false })}</b></div>
        <div><small>待招角色</small><b>编程 1 人 · 写作 1 人</b></div>
        <div><small>每周投入</small><b>不少于 {weeklyHours} 小时</b></div>
      </div>
      {error && <p className="p0-error">{error}</p>}
      <button className="wide-button" type="submit" disabled={phase === "working" || !password}>
        {phase === "working" ? "正在写入数据库并计算匹配…" : "登录、发布并运行真实匹配"}<span>→</span>
      </button>
      <small className="p0-dev-note">本地种子账号可用于联调；账号身份来自 JWT，候选人和匹配结果均由服务端读取并持久化。</small>
    </form> : matchRun && <>
      {requestStatus === "CANCELLED" && <p className="p0-error">该需求已取消，候选结果仅作为历史记录展示。</p>}
      <div className="p0-proof-strip">
        <span>✓ 需求已入库</span><span>✓ 匹配批次已保存</span><span>✓ 已从数据库回读</span>
      </div>
      <div className="p0-id-block"><small>requestId</small><code>{requestId}</code><small>matchRunId</small><code>{matchRun.id}</code></div>
      <div className="p0-candidate-list">
        {matchRun.candidates.map((candidate) => <article key={candidate.id}>
          <span>{candidate.displayName.slice(0, 1)}</span>
          <div><div><b>{candidate.displayName}</b><em>{candidate.candidateType === "PRIMARY" ? "主选" : `候补 #${candidate.rank - 1}`}</em></div><p>{roleName(candidate)} · {candidate.reasons.join(" · ")}</p></div>
          <strong>{Number(candidate.score).toFixed(0)}<small>分</small></strong>
        </article>)}
        {!matchRun.candidates.length && <div className="p0-empty">需求已保存，但当前没有通过硬门槛的候选人。可调整启动会时间或每周投入后重新发布。</div>}
      </div>
      <div className="p0-handoff"><b>真实邀请已入库</b><p>主选和候补邀请由服务端创建并共享；本页每 5 秒从服务端刷新匹配结果，不模拟其他账号回应。</p></div>
      {!["CANCELLED", "FULFILLED", "EXPIRED"].includes(requestStatus) && <button className="wide-button secondary" onClick={() => void cancelCurrent()}>取消当前需求<span>×</span></button>}
      <button className="wide-button secondary" onClick={() => { setPhase("idle"); setMatchRun(null); setRequestId(""); setRequestStatus(""); }}>再发布一条需求<span>→</span></button>
    </>}
    <button className="p0-back" onClick={onBack}>← 返回修改组队条件</button>
  </div>;
}
