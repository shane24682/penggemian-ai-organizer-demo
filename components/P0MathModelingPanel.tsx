"use client";

import { FormEvent, useState } from "react";

import {
  getCurrentMatching,
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
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [matchRun, setMatchRun] = useState<PersistedMatchRun | null>(null);

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
      const published = await publishMathModelingRequest(session.accessToken, {
        title: "数模队伍招募编程与写作成员",
        startsAt,
        endsAt,
        weeklyHoursRequired: weeklyHours,
      });
      setRequestId(published.id);
      await runMatching(session.accessToken, published.id);
      const persisted = await getCurrentMatching(session.accessToken, published.id);
      setMatchRun(persisted);
      setPhase("done");
      onNotify(`真实需求已发布，已保存 ${persisted.candidateCount} 位候选人`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布或匹配失败");
      setPhase("idle");
    }
  };

  return <div className="panel p0-match-panel">
    <div className="p0-match-head">
      <div><span>P0 · REAL DATA FLOW</span><h3>发布真实数模组队需求</h3><p>发起人默认承担建模岗，系统从 PostgreSQL 筛选编程和论文写作候选人。</p></div>
      <b>真实数据库</b>
    </div>

    {phase !== "done" ? <form onSubmit={submit}>
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
      <div className="p0-handoff"><b>下一步：邀请服务</b><p>候选结果已经是真实共享数据；邀请、接受/拒绝、候补递补和成局由另一位同学的服务接入，这里不模拟对方回应。</p></div>
      <button className="wide-button secondary" onClick={() => { setPhase("idle"); setMatchRun(null); setRequestId(""); }}>再发布一条需求<span>→</span></button>
    </>}
    <button className="p0-back" onClick={onBack}>← 返回修改组队条件</button>
  </div>;
}
