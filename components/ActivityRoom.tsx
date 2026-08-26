"use client";

import { FormEvent, useState } from "react";
import type { MatchScene, OnlinePreferences, ScoredCandidate } from "../lib/matching";
import { buildAmapNavigationUrl, type Coordinate } from "../lib/location";
import Icon from "./Icon";

type VenueOption = {
  id: string;
  name: string;
  address: string;
  coordinate: Coordinate;
  pricePerHour: number;
  openHours: string;
  rating: number;
  perPerson: number;
  equipmentNote: string;
};

type Props = {
  activity: string;
  scene: MatchScene;
  time: string;
  seats: number;
  aiServiceFee: number;
  onlinePreferences: OnlinePreferences;
  selectedVenue?: VenueOption;
  venues: VenueOption[];
  participants: ScoredCandidate[];
  onSelectVenue: (id: string) => void;
  onAddMobileCalendar: () => void;
  onEndActivity: () => void;
  onNotify: (message: string) => void;
};

export default function ActivityRoom({
  activity,
  scene,
  time,
  seats,
  aiServiceFee,
  onlinePreferences,
  selectedVenue,
  venues,
  participants,
  onSelectVenue,
  onAddMobileCalendar,
  onEndActivity,
  onNotify,
}: Props) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    { name: "AI主理人", text: `欢迎开始${activity}。请先完成下面的活动目标投票。`, ai: true },
    { name: participants[0]?.name || "林小满", text: "我已经确认时间，按时到！", ai: false },
  ]);
  const [venueVotes, setVenueVotes] = useState<Record<string, number>>(() => Object.fromEntries(venues.map((venue, index) => [venue.id, index === 0 ? 3 : 1])));
  const [reminder, setReminder] = useState(true);
  const [exitRequested, setExitRequested] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const navigationUrl = selectedVenue ? buildAmapNavigationUrl(selectedVenue, "walk") : "";

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    setMessages(current => [...current, { name: "Young", text: message.trim(), ai: false }]);
    setMessage("");
  };

  const voteVenue = (id: string) => {
    setVenueVotes(current => ({ ...current, [id]: (current[id] || 0) + 1 }));
    onSelectVenue(id);
    onNotify("场馆投票已记录，截止前可以修改");
  };

  return <div className="activity-room">
    <div className="room-head"><div><span>START MEETING · 已正式成局</span><h2>{activity} · 开始碰面</h2><p>{time} · {scene === "offline" && selectedVenue ? <a className="room-venue-link" href={navigationUrl} target="_blank" rel="noreferrer" onClick={() => onNotify("正在打开高德地图，默认从当前位置步行导航")}>{selectedVenue.name}<i>↗</i></a> : scene === "online" ? "临时线上房间" : "项目协作空间"} · {seats}/{seats}人已确认</p></div><div className="room-members"><span>Y</span>{participants.slice(0, 5).map(person => <span key={person.id}>{person.avatar}</span>)}</div></div>

    <div className="room-layout">
      <section className="room-main">
        <div className="room-chat"><div className="room-section-title"><b>活动群聊</b><span>只对本局成员开放</span></div><div className="message-list">{messages.map((item, index) => <div key={`${item.name}-${index}`} className={item.ai ? "ai-message" : "member-message"}><i>{item.ai ? "碰" : item.name.slice(0, 1)}</i><div><b>{item.name}</b><p>{item.text}</p></div></div>)}</div><form onSubmit={sendMessage}><input value={message} onChange={event => setMessage(event.target.value)} placeholder={`聊聊${activity}的规则、装备或集合安排…`}/><button type="submit">发送</button></form></div>
      </section>

      <aside className="room-side">
        {scene === "offline" && selectedVenue && <div className="room-panel venue-vote"><div className="room-section-title"><b>场馆投票</b><span>18:30截止</span></div>{venues.map(venue => <button key={venue.id} className={selectedVenue.id === venue.id ? "selected" : ""} onClick={() => voteVenue(venue.id)}><div><b>{venue.name}</b><p>{venue.openHours} · ★{venue.rating}</p></div><span>{venueVotes[venue.id] || 0}票</span></button>)}</div>}

        {scene === "offline" && selectedVenue ? <div className="room-panel fee-detail"><div className="room-section-title"><b>费用明细</b><span>公开透明</span></div><p><span>人均场地费</span><b>¥{selectedVenue.perPerson}</b></p><p><span>AI 服务费</span><b>¥{aiServiceFee}/人</b></p><p><span>器材</span><b>{selectedVenue.equipmentNote}</b></p><p className="total"><span>每人合计</span><b>¥{selectedVenue.perPerson + aiServiceFee}</b></p></div> : <div className="room-panel online-room-detail"><div className="room-section-title"><b>{scene === "online" ? "线上房间偏好" : "协作空间"}</b><span>确认成员可见</span></div>{scene === "online" ? <><p><span>段位 / 区服</span><b>{onlinePreferences.rank} · {onlinePreferences.server}</b></p><p><span>在线时段</span><b>{onlinePreferences.onlineTime}</b></p><p><span>沟通偏好</span><b>{onlinePreferences.language} · {onlinePreferences.voice === "off" ? "不开麦" : onlinePreferences.voice === "required" ? "需要开麦" : "开麦均可"}</b></p></> : <p><span>协作状态</span><b>角色、目标和投入时间已对齐</b></p>}</div>}

        {scene === "offline" && selectedVenue && <div className="room-panel departure-card"><div className="room-section-title"><b>出发与签到</b><span>{reminder ? "提醒已开" : "提醒已关"}</span></div><a className="venue-navigation" href={navigationUrl} target="_blank" rel="noreferrer" onClick={() => onNotify("正在打开高德地图，默认从当前位置步行导航")}><span><b>{selectedVenue.name}</b><small>{selectedVenue.address}</small></span><em>去高德导航 →</em></a><div className="checkin-code"><span>签到码</span><b>2861</b><small>活动前30分钟开放</small></div><button onClick={() => setReminder(value => !value)}>{reminder ? "关闭出发提醒" : "开启出发提醒"}</button><div className="calendar-actions mobile-only"><button className="mobile-calendar-button" onClick={() => setCalendarOpen(true)}>添加到手机日历</button><small>支持 iPhone / Android / 电脑 · 提前 1 小时提醒</small></div></div>}

        <div className="room-panel room-safety"><div className="room-section-title"><b>临时变动</b><span>候补自动接力</span></div>{exitRequested ? <div className="replacement"><b>已发出递补邀请</b><p>候补成员正在确认，原名额暂时保留10分钟。</p></div> : <button onClick={() => { setExitRequested(true); onNotify("退出申请已提交，AI正在邀请候补"); }}>临时退出并通知候补</button>}<button onClick={() => onNotify("已打开举报与安全协助入口")}>举报 / 拉黑 / 安全协助</button></div>
      </aside>
    </div>

    <button className="simulate-finish" onClick={onEndActivity}>模拟活动结束，进入互评与关系沉淀 →</button>

    {calendarOpen && <div className="modal-layer calendar-modal-layer" onMouseDown={event => { if (event.target === event.currentTarget) setCalendarOpen(false); }}>
      <section className="action-modal calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-modal-title">
        <button className="modal-close" aria-label="关闭日历预览" onClick={() => setCalendarOpen(false)}><Icon name="x" size="sm"/></button>
        <span>ADD TO CALENDAR</span>
        <h2 id="calendar-modal-title">添加到手机日历</h2>
        <p>确认后会生成一个标准日历事件，由你的设备选择系统日历或其他日历应用打开。</p>
        <div className="calendar-preview">
          <div><span>活动</span><b>碰个面｜{activity}</b></div>
          <div><span>时间</span><b>{time}（约 2 小时）</b></div>
          <div><span>地点</span><b>{scene === "offline" && selectedVenue ? <>{selectedVenue.name}<small>{selectedVenue.address}</small></> : scene === "online" ? "临时线上房间" : "项目协作空间"}</b></div>
          <div><span>提醒</span><b>开始前 1 小时</b></div>
        </div>
        <div className="calendar-privacy"><i><Icon name="shield-check" size="sm"/></i><p><b>不会读取你的日历</b><small>仅生成本次活动的日历文件；是否保存由你在系统日历中确认。</small></p></div>
        <div className="calendar-modal-actions"><button onClick={() => setCalendarOpen(false)}>暂不添加</button><button onClick={() => { onAddMobileCalendar(); setCalendarOpen(false); }}>确认并打开日历</button></div>
      </section>
    </div>}
  </div>;
}
