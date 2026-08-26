"use client";

import { useEffect, useMemo, useState } from "react";
import type { MatchPlan, MatchScene, OnlinePreferences, ScoredCandidate } from "../lib/matching";
import {
  advanceDemoInvitation,
  createInvitationRound,
  invitationCounts,
  maskDistance,
  respondToInvitation,
} from "../lib/invitations";
import type { Coordinate } from "../lib/location";
import AmapVenueMap from "./AmapVenueMap";

type VenueOption = {
  id: string;
  name: string;
  coordinate: Coordinate;
  pricePerHour: number;
  openHours: string;
  rating: number;
  reviewCount: number;
  recentReview: string;
  perPerson: number;
  equipmentIncluded: boolean;
  equipmentNote: string;
};

type Props = {
  matchPlan: MatchPlan;
  scene: MatchScene;
  activity: string;
  time: string;
  seats: number;
  level: string;
  userLocation: Coordinate;
  venues: VenueOption[];
  selectedVenueId: string;
  aiServiceFee: number;
  onlinePreferences: OnlinePreferences;
  onSelectVenue: (id: string) => void;
  onFormActivity: (participants: ScoredCandidate[]) => void;
  onNotify: (message: string) => void;
};

const statusLabel = {
  confirmed: "已确认",
  waiting: "等待回应",
  queued: "下一批邀请",
  declined: "已拒绝",
  timedout: "已超时",
};

const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export default function InvitationMatch({
  matchPlan,
  scene,
  activity,
  time,
  seats,
  level,
  userLocation,
  venues,
  selectedVenueId,
  aiServiceFee,
  onlinePreferences,
  onSelectVenue,
  onFormActivity,
  onNotify,
}: Props) {
  const [round, setRound] = useState(() => createInvitationRound(matchPlan.selected, matchPlan.backups, seats));
  const [secondsLeft, setSecondsLeft] = useState(14 * 60 + 32);
  const [venueVotes, setVenueVotes] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    venues.forEach((venue, index) => { seed[venue.id] = [3, 1, 1][index] || 1; });
    return seed;
  });
  const [userVenueVote, setUserVenueVote] = useState<string | null>(null);
  const counts = useMemo(() => invitationCounts(round), [round]);
  const ready = counts.confirmed >= seats;
  const sameFrequencyTargets = useMemo(
    () => round.candidates.filter(candidate => candidate.reasons.some(reason => reason.startsWith("同频标签："))),
    [round.candidates],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setSecondsLeft(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (secondsLeft !== 0 || ready) return;
    const waiting = round.candidates.find(candidate => candidate.invitationStatus === "waiting");
    if (!waiting) return;
    const promotion = window.setTimeout(() => {
      setRound(current => respondToInvitation(current, waiting.id, "timeout"));
      setSecondsLeft(10 * 60);
      onNotify("有人超时未回应，已自动邀请下一位候补");
    }, 0);
    return () => window.clearTimeout(promotion);
  }, [secondsLeft, ready, round.candidates, onNotify]);

  const advance = () => {
    const before = invitationCounts(round);
    const next = advanceDemoInvitation(round);
    const after = invitationCounts(next);
    setRound(next);
    if (after.confirmed > before.confirmed) onNotify("收到一位同学确认，仍需达到人数阈值");
    else onNotify("有人拒绝邀请，候补已自动递补");
  };

  const totalVenueVotes = Object.values(venueVotes).reduce((sum, n) => sum + n, 0);
  const sortedVenues = [...venues].sort((a, b) => (venueVotes[b.id] || 0) - (venueVotes[a.id] || 0));
  const selectedVenue = venues.find(venue => venue.id === selectedVenueId);
  const voteVenue = (venueId: string) => {
    setVenueVotes(current => {
      const next = { ...current };
      if (userVenueVote === venueId) {
        next[venueId] = Math.max(0, (next[venueId] || 0) - 1);
        setUserVenueVote(null);
      } else {
        if (userVenueVote) next[userVenueVote] = Math.max(0, (next[userVenueVote] || 0) - 1);
        next[venueId] = (next[venueId] || 0) + 1;
        setUserVenueVote(venueId);
      }
      return next;
    });
  };

  return <div className="invitation-match">
    <div className="invite-head">
      <div><span>STEP 03 · DOUBLE CONSENT</span><h3>AI推荐同频候选人，正在分别邀请</h3><p>{level}{activity} · {time} · 满 {seats} 人后才正式成局</p></div>
      <div className="invite-clock"><small>本轮邀请剩余</small><b>{clock(secondsLeft)}</b></div>
    </div>

    <div className="invite-summary">
      <div className="confirmed"><b>{counts.confirmed}/{seats}</b><span>已确认</span></div>
      <div><b>{counts.waiting}</b><span>等待回应</span></div>
      <div><b>{counts.backups}</b><span>候补</span></div>
      <div><b>{matchPlan.averageMatch}%</b><span>平均匹配度</span></div>
    </div>

    <div className="invite-flow"><span className="done">算法推荐</span><i>→</i><span className={ready ? "done" : "active"}>分别邀请</span><i>→</i><span className={ready ? "done" : ""}>达到阈值</span><i>→</i><span className={ready ? "active" : ""}>{scene === "offline" ? "锁定场地" : scene === "online" ? "创建房间" : "建立协作"}</span></div>

    <div className="same-frequency-push">
      <b>已向 {sameFrequencyTargets.length} 位同频同学主动推送邀请</b>
      <span>本场权重：{matchPlan.factors.join(" · ")}；同校与参与范围先做硬筛选，对方仍可确认、拒绝或忽略。</span>
    </div>

    <div className="candidate-list">
      {round.candidates.map((person, index) => <article key={`${person.id}-${person.source}`} className={`candidate-row ${person.invitationStatus}`}>
        <span className={`portrait p${index % 5}`}>{person.avatar}</span>
        <div className="candidate-copy"><div><b>{person.name}</b><em>{person.matchPercent}% 匹配度</em></div><p>{maskDistance(person.distanceKm)} · {person.level} · 守约率 {Math.round(person.trustRate * 100)}%</p><div>{person.reasons.slice(0, 3).map(reason => <small key={reason}>{reason}</small>)}</div><details className="match-breakdown"><summary>查看匹配分析</summary><div>{person.breakdown.map(item=><p key={item.key}><span>{item.label}<small>权重 {item.weight}%</small></span><i><b style={{width:`${item.weight ? item.score / item.weight * 100 : 0}%`}}/></i><em>{item.score}/{item.weight}</em></p>)}</div></details></div>
        <span className={`invite-status ${person.invitationStatus}`}>{statusLabel[person.invitationStatus]}</span>
      </article>)}
    </div>

    <div className="backup-line"><b>候补队列</b>{round.backups.length ? round.backups.map(person => <span key={person.id}>{person.avatar} {person.name} · {person.reasons[0]}</span>) : <span>候补已全部进入邀请</span>}</div>

    <div className="invite-demo-actions">
      {!ready && <button onClick={advance}>模拟下一位同学回应 →</button>}
      {!ready && <p>每次点击会运行“确认 / 拒绝 → 自动递补”状态逻辑，AI不会直接宣布匹配成功。</p>}
    </div>

    {scene === "offline" ? <section className={`venue-lock ${ready ? "ready" : ""}`}>
      <div className="venue-lock-head"><div><span>{ready ? "人数已达阈值 · 选择场地" : "场馆投票 · 选择你偏好的场地"}</span><h3>{ready ? "选择场地并开始碰面" : "点击场地卡片投票，达标后解锁地址"}</h3></div><b>{ready ? "可锁定" : `已收到 ${totalVenueVotes} 票`}</b></div>
      {ready && <AmapVenueMap center={userLocation} venues={venues} selectedVenueId={selectedVenueId} onSelectVenue={onSelectVenue} compact />}
      <div className="invite-venues">{sortedVenues.map((venue) => {
        const votes = venueVotes[venue.id] || 0;
        const percent = totalVenueVotes ? Math.round((votes / totalVenueVotes) * 100) : 0;
        const isVoted = userVenueVote === venue.id;
        const isSelected = selectedVenueId === venue.id;
        const oi = venues.findIndex(v => v.id === venue.id);
        return <button key={venue.id} className={`${isSelected ? "selected" : ""} ${isVoted ? "voted" : ""}`} onClick={() => { voteVenue(venue.id); if (ready) onSelectVenue(venue.id); }}><span className="venue-num">0{oi + 1}</span><div className="venue-info"><b>{venue.name}</b><p>¥{venue.pricePerHour}/小时 · {venue.openHours} · ★{venue.rating}（{venue.reviewCount}）</p><small>{ready ? venue.recentReview : "地址将在全员确认后显示"}</small><div className="venue-vote-bar"><i style={{ width: `${percent}%` }} /></div></div><div className="venue-vote-stat"><b>{votes}票</b><span>{percent}%</span><em>场地 ¥{venue.perPerson}/人</em><small>{venue.equipmentIncluded ? "含器材" : "不含器材"}</small></div></button>;
      })}</div>
      <div className="venue-vote-hint">{userVenueVote ? <span>已为 <b>{venues.find(v => v.id === userVenueVote)?.name}</b> 投票 · 点击可改投</span> : <span>点击任意场地即可投票，截止前可随时修改</span>}</div>
      <div className="venue-compare"><span>场地对比</span>{venues.map(v => <em key={v.id}>{v.name}：¥{v.perPerson}/人 · {v.equipmentNote}</em>)}</div>
      {selectedVenue && <div className="lock-cost"><span>人均场地费 ¥{selectedVenue.perPerson} · AI 服务费 ¥{aiServiceFee} · {selectedVenue.equipmentNote}</span><b>每人合计 ¥{selectedVenue.perPerson + aiServiceFee}</b></div>}
      <button className="form-activity" disabled={!ready || !selectedVenueId} onClick={() => onFormActivity(round.candidates.filter(candidate => candidate.invitationStatus === "confirmed").slice(0, Math.max(0, seats - 1)))}>{ready ? selectedVenueId ? "锁定场地并开始碰面 →" : "请选择最终场地" : "等待全部确认后才能成局"}</button>
    </section> : <section className={`session-lock ${ready ? "ready" : ""}`}>
      <div className="venue-lock-head"><div><span>{ready ? "人数已达阈值" : "等待全部成员确认"}</span><h3>{scene === "online" ? "确认后创建临时线上房间" : "确认后建立项目协作空间"}</h3></div><b>{ready ? "可以开始" : `${counts.confirmed}/${seats}`}</b></div>
      {scene === "online" ? <div className="session-preferences"><span>段位：{onlinePreferences.rank}</span><span>区服：{onlinePreferences.server}</span><span>在线：{onlinePreferences.onlineTime}</span><span>{onlinePreferences.language} · {onlinePreferences.voice === "off" ? "不开麦" : onlinePreferences.voice === "required" ? "需要开麦" : "开麦均可"}</span></div> : <div className="session-preferences"><span>角色与能力已核验</span><span>协作时间已对齐</span><span>联系方式确认后可见</span></div>}
      <button className="form-activity" disabled={!ready} onClick={() => onFormActivity(round.candidates.filter(candidate => candidate.invitationStatus === "confirmed").slice(0, Math.max(0, seats - 1)))}>{ready ? scene === "online" ? "创建临时房间并开始碰面 →" : "建立协作空间并开始碰面 →" : "等待全部确认后才能成局"}</button>
    </section>}

    <div className="pre-match-privacy"><b>成局前隐私保护</b><span>只显示同校与必要匹配信息</span><span>不展示联系方式与实时坐标</span><span>{scene === "offline" ? "场地地址达标后解锁" : "房间信息确认后解锁"}</span></div>
  </div>;
}
