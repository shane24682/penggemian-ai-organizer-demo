"use client";

import { useEffect, useMemo, useState } from "react";
import type { MatchPlan, ScoredCandidate } from "../lib/matching";
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
};

type Props = {
  matchPlan: MatchPlan;
  activity: string;
  time: string;
  seats: number;
  level: string;
  userLocation: Coordinate;
  venues: VenueOption[];
  selectedVenueId: string;
  venueFeeIncluded: boolean;
  seatPrice: number;
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
  activity,
  time,
  seats,
  level,
  userLocation,
  venues,
  selectedVenueId,
  venueFeeIncluded,
  seatPrice,
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
  const topVenue = sortedVenues[0];
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
      <div><span>STEP 03 · DOUBLE CONSENT</span><h3>AI推荐了候选人，正在分别邀请</h3><p>{level}{activity} · {time} · 满 {seats} 人后才正式成局</p></div>
      <div className="invite-clock"><small>本轮邀请剩余</small><b>{clock(secondsLeft)}</b></div>
    </div>

    <div className="invite-summary">
      <div className="confirmed"><b>{counts.confirmed}/{seats}</b><span>已确认</span></div>
      <div><b>{counts.waiting}</b><span>等待回应</span></div>
      <div><b>{counts.backups}</b><span>候补</span></div>
      <div><b>{matchPlan.averageScore}</b><span>平均适配分</span></div>
    </div>

    <div className="invite-flow"><span className="done">算法推荐</span><i>→</i><span className={ready ? "done" : "active"}>分别邀请</span><i>→</i><span className={ready ? "done" : ""}>达到阈值</span><i>→</i><span className={ready ? "active" : ""}>锁定场地</span></div>

    <div className="candidate-list">
      {round.candidates.map((person, index) => <article key={`${person.id}-${person.source}`} className={`candidate-row ${person.invitationStatus}`}>
        <span className={`portrait p${index % 5}`}>{person.avatar}</span>
        <div className="candidate-copy"><div><b>{person.name}</b><em>{person.score}分</em></div><p>{maskDistance(person.distanceKm)} · {person.level} · 守约率 {Math.round(person.trustRate * 100)}%</p><div>{person.reasons.slice(0, 3).map(reason => <small key={reason}>{reason}</small>)}</div></div>
        <span className={`invite-status ${person.invitationStatus}`}>{statusLabel[person.invitationStatus]}</span>
      </article>)}
    </div>

    <div className="backup-line"><b>候补队列</b>{round.backups.length ? round.backups.map(person => <span key={person.id}>{person.avatar} {person.name} · {person.reasons[0]}</span>) : <span>候补已全部进入邀请</span>}</div>

    <div className="invite-demo-actions">
      {!ready && <button onClick={advance}>模拟下一位同学回应 →</button>}
      {!ready && <p>每次点击会运行“确认 / 拒绝 → 自动递补”状态逻辑，AI不会直接宣布匹配成功。</p>}
    </div>

    <section className={`venue-lock ${ready ? "ready" : ""}`}>
      <div className="venue-lock-head"><div><span>{ready ? "人数已达阈值 · 选择场地" : "场馆投票 · 选择你偏好的场地"}</span><h3>{ready ? "选择场地并正式成局" : "点击场地卡片投票，达标后解锁地址"}</h3></div><b>{ready ? "可锁定" : `已收到 ${totalVenueVotes} 票`}</b></div>
      {ready && <AmapVenueMap center={userLocation} venues={venues} selectedVenueId={selectedVenueId} onSelectVenue={onSelectVenue} compact />}
      <div className="invite-venues">{sortedVenues.map((venue) => {
        const votes = venueVotes[venue.id] || 0;
        const percent = totalVenueVotes ? Math.round((votes / totalVenueVotes) * 100) : 0;
        const isVoted = userVenueVote === venue.id;
        const isSelected = selectedVenueId === venue.id;
        const oi = venues.findIndex(v => v.id === venue.id);
        return <button key={venue.id} className={`${isSelected ? "selected" : ""} ${isVoted ? "voted" : ""}`} onClick={() => { voteVenue(venue.id); if (ready) onSelectVenue(venue.id); }}><span className="venue-num">0{oi + 1}</span><div className="venue-info"><b>{venue.name}</b><p>¥{venue.pricePerHour}/小时 · {venue.openHours} · ★{venue.rating}（{venue.reviewCount}）</p><small>{ready ? venue.recentReview : "地址将在全员确认后显示"}</small><div className="venue-vote-bar"><i style={{ width: `${percent}%` }} /></div></div><div className="venue-vote-stat"><b>{votes}票</b><span>{percent}%</span><em>约¥{venue.perPerson}/人</em></div></button>;
      })}</div>
      <div className="venue-vote-hint">{userVenueVote ? <span>已为 <b>{venues.find(v => v.id === userVenueVote)?.name}</b> 投票 · 点击可改投</span> : <span>点击任意场地即可投票，截止前可随时修改</span>}</div>
      <div className="venue-compare"><span>场地对比</span>{venues.map(v => <em key={v.id}>{v.name}：¥{v.pricePerHour}/h · ★{v.rating} · {v.openHours}</em>)}</div>
      <div className="lock-cost"><span>{venueFeeIncluded ? "席位含场地费" : "场地费现场AA"}</span><b>¥{seatPrice}/席</b></div>
      <button className="form-activity" disabled={!ready || !selectedVenueId} onClick={() => onFormActivity(round.candidates.filter(candidate => candidate.invitationStatus === "confirmed").slice(0, Math.max(0, seats - 1)))}>{ready ? `锁定场地并正式成局 · ¥${seatPrice} →` : "等待全部确认后才能成局"}</button>
    </section>

    <div className="pre-match-privacy"><b>成局前隐私保护</b><span>只显示同校与距离区间</span><span>不展示宿舍、实时坐标</span><span>场地地址达标后解锁</span></div>
  </div>;
}
