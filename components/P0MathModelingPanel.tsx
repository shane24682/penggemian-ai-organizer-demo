"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  ApiRequestError,
  cancelPublishedRequest,
  getCurrentMatching,
  getMyRequests,
  publishMathModelingRequest,
  runMatching,
  type PersistedMatchRun,
} from "@/lib/p0-api";
import { useAuth } from "@/features/auth/AuthProvider";

type Props = {
  startsAtValue: string;
  weeklyHours: number;
  onBack: () => void;
  onOpenRequests: () => void;
  onNotify: (message: string) => void;
};

const roleName = (candidate: PersistedMatchRun["candidates"][number]) => {
  const roleReason = candidate.breakdown.find((item) => item.key === "role")?.detail || "能力符合角色要求";
  if (roleReason.startsWith("CODING")) return "编程";
  if (roleReason.startsWith("WRITING")) return "论文写作";
  if (roleReason.startsWith("MODELING")) return "建模";
  return "灵活补位";
};

export default function P0MathModelingPanel({ startsAtValue, weeklyHours, onBack, onOpenRequests, onNotify }: Props) {
  const { accessToken, user, logout } = useAuth();
  const [phase, setPhase] = useState<"idle" | "restoring" | "working" | "done">("restoring");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [requestStatus, setRequestStatus] = useState("");
  const [matchRun, setMatchRun] = useState<PersistedMatchRun | null>(null);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (!accessToken) {
        if (active) setPhase("idle");
        return;
      }
      try {
        const ownRequests = await getMyRequests(accessToken);
        const latest = ownRequests.find((item) => item.competitionName === "全国大学生数学建模竞赛");
        if (!latest) {
          if (active) setPhase("idle");
          return;
        }
        const persisted = await getCurrentMatching(accessToken, latest.id);
        if (!active) return;
        setRequestId(latest.id);
        setRequestStatus(latest.status);
        setMatchRun(persisted);
        setPhase("done");
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiRequestError && caught.status === 401) {
          logout("登录已失效，请重新登录");
        }
        setPhase("idle");
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, [accessToken, logout]);

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
      const published = await publishMathModelingRequest(accessToken, {
        title: "数模队伍招募编程与写作成员",
        startsAt,
        endsAt,
        weeklyHoursRequired: weeklyHours,
      });
      setRequestId(published.id);
      setRequestStatus(published.status);
      await runMatching(accessToken, published.id);
      const persisted = await getCurrentMatching(accessToken, published.id);
      setMatchRun(persisted);
      setRequestStatus(persisted.candidateCount > 0 ? "INVITING" : "OPEN");
      setPhase("done");
      onNotify(`需求已发布，已找到 ${persisted.candidateCount} 位候选人`);
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
      <div><span>数学建模竞赛组队</span><h3>发布数模组队需求</h3><p>你默认承担建模岗，我们为你寻找编程和论文写作成员。</p></div>
      <b>智能匹配</b>
    </div>

    {phase === "restoring" ? <div className="p0-empty">正在恢复上次需求和匹配结果…</div> : phase !== "done" ? <form onSubmit={submit}>
      <div className="p0-current-user"><small>当前发起人</small><b>{user?.displayName}</b><span>发布后可在“我的需求”查看</span></div>
      <div className="p0-frozen-summary">
        <div><small>场景</small><b>全国大学生数学建模竞赛</b></div>
        <div><small>首次启动会</small><b>{new Date(startsAtValue).toLocaleString("zh-CN", { hour12: false })}</b></div>
        <div><small>待招角色</small><b>编程 1 人 · 写作 1 人</b></div>
        <div><small>每周投入</small><b>不少于 {weeklyHours} 小时</b></div>
      </div>
      {error && <p className="p0-error">{error}</p>}
      <button className="wide-button" type="submit" disabled={phase === "working" || !accessToken}>
        {phase === "working" ? "正在发布并计算匹配…" : "发布并开始匹配"}<span>→</span>
      </button>
    </form> : matchRun && <>
      {requestStatus === "CANCELLED" && <p className="p0-error">该需求已取消，候选结果仅作为历史记录展示。</p>}
      <div className="p0-proof-strip">
        <span>✓ 需求已发布</span><span>✓ 匹配已完成</span><span>✓ {matchRun.candidateCount ? "邀请已发送" : "等待合适成员"}</span>
      </div>
      <div className="p0-candidate-list">
        {matchRun.candidates.map((candidate) => <article key={candidate.id}>
          <span>{candidate.displayName.slice(0, 1)}</span>
          <div><div><b>{candidate.displayName}</b><em>{candidate.candidateType === "PRIMARY" ? "主选" : `候补 #${candidate.rank - 1}`}</em></div><p>{roleName(candidate)} · {candidate.reasons.join(" · ")}</p></div>
          <strong>{Number(candidate.score).toFixed(0)}<small>分</small></strong>
        </article>)}
        {!matchRun.candidates.length && <div className="p0-empty">需求已保存，但当前没有通过硬门槛的候选人。可调整启动会时间或每周投入后重新发布。</div>}
      </div>
      <div className="p0-handoff"><b>邀请已发送</b><p>主选将先收到邀请；拒绝或超时后，候补会依次递补。</p></div>
      {!["CANCELLED", "FULFILLED", "EXPIRED"].includes(requestStatus) && <button className="wide-button secondary" onClick={() => void cancelCurrent()}>取消当前需求<span>×</span></button>}
      <button className="wide-button secondary" onClick={onOpenRequests}>查看我的需求<span>→</span></button>
      <button className="wide-button secondary" onClick={() => { setPhase("idle"); setMatchRun(null); setRequestId(""); setRequestStatus(""); }}>再发布一条需求<span>→</span></button>
    </>}
    <button className="p0-back" onClick={onBack}>← 返回修改组队条件</button>
  </div>;
}
