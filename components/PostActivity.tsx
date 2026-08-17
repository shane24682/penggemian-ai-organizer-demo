"use client";

import { useState } from "react";
import type { ScoredCandidate } from "../lib/matching";

type Props = {
  activity: string;
  participants: ScoredCandidate[];
  onRegroup: () => void;
  onSaveConnections: (ids: string[]) => void;
  onNotify: (message: string) => void;
};

export default function PostActivity({ activity, participants, onRegroup, onSaveConnections, onNotify }: Props) {
  const [rating, setRating] = useState(5);
  const [selected, setSelected] = useState<string[]>(participants.slice(0, 4).map(person => person.id));
  const [connectionState, setConnectionState] = useState<"idle" | "waiting" | "connected">("idle");
  const [organizerFollowed, setOrganizerFollowed] = useState(false);

  const togglePerson = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  const sendMutualRequest = () => {
    if (!selected.length) { onNotify("请至少选择一位愿意再次同局的人"); return; }
    setConnectionState("waiting");
    onNotify("再次同局意愿已私密发送，只有双方都选择才会建立关系");
  };

  const simulateMutualConsent = () => {
    setConnectionState("connected");
    onSaveConnections(selected);
    onNotify("双方意愿匹配成功，已加入活动好友");
  };

  return <div className="post-activity">
    <div className="post-success"><span>✓</span><div><em>ACTIVITY COMPLETED</em><h2>活动结束，关系不必散场</h2><p>先评价活动体验，再私密选择愿意再次同局的人；只有双方同意才成为活动好友。</p></div></div>

    <div className="post-grid">
      <section className="review-card"><span>01 · 评价活动和组织体验</span><h3>这次{activity}体验怎么样？</h3><div className="rating-row">{[1,2,3,4,5].map(value => <button key={value} className={value <= rating ? "active" : ""} onClick={() => setRating(value)}>★</button>)}</div><div className="review-tags">{["准时开场","规则清楚","场地不错","AI提醒有用"].map(tag => <button key={tag} onClick={() => onNotify(`已记录评价：${tag}`)}>{tag}</button>)}</div><small>评价用于优化组织体验，不公开羞辱个人；异常行为请走举报流程。</small></section>

      <section className="reconnect-card"><span>02 · 选择愿意再次同局的人</span><h3>你的选择只有在双方同意后才会生效</h3><div className="reconnect-people">{participants.map(person => <button key={person.id} className={selected.includes(person.id) ? "selected" : ""} onClick={() => togglePerson(person.id)}><i>{person.avatar}</i><b>{person.name}</b><small>{person.reasons[0]}</small><em>{selected.includes(person.id) ? "✓" : "+"}</em></button>)}</div>{connectionState === "idle" && <button className="mutual-button" onClick={sendMutualRequest}>向已选 {selected.length} 人发送“愿意再同局” →</button>}{connectionState === "waiting" && <div className="mutual-wait"><div><b>等待对方确认</b><p>不会直接加好友，也不会公开谁没有选择你。</p></div><button onClick={simulateMutualConsent}>模拟对方同意</button></div>}{connectionState === "connected" && <div className="mutual-done"><b>✓ 双向同意完成</b><p>已成为活动好友，可以一键复组。</p></div>}</section>
    </div>

    <section className="relationship-actions"><div><span>03 · 把一次活动变成长期关系</span><h3>下一步想怎么继续？</h3></div><div className="relationship-grid"><button onClick={onRegroup}><b>↻</b><span>和其中{selected.length || 4}人再次组局<small>沿用时间、水平与场地偏好</small></span></button><button onClick={() => { setOrganizerFollowed(true); onNotify("已关注AI主理人与本活动模板"); }}><b>＋</b><span>{organizerFollowed ? "已关注这个主理人" : "关注这个活动主理人"}<small>收到同类活动和空位提醒</small></span></button><button onClick={() => onNotify("已创建每周六固定复组计划")}><b>六</b><span>固定每周六复组<small>每周自动发起双向确认</small></span></button><button onClick={() => { localStorage.setItem("penggemian-long-group", JSON.stringify({ activity, members: selected, createdAt: new Date().toISOString() })); onNotify(`已创建${activity}长期小组`); }}><b>组</b><span>创建{activity}长期小组<small>成员仍可随时退出或屏蔽</small></span></button></div></section>
  </div>;
}
