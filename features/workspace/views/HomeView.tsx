import Icon from "@/components/Icon";
import type { Activity } from "../types";

type HomeViewProps = {
  cards: Activity[];
  selectedActivity: string;
  onRefresh: () => void;
  onSelect: (name: string) => void;
  onStart: () => void;
};

const displayName = (item: Activity, index: number) => {
  if (index === 0 && item.name === "羽毛球双打") return "羽毛球成局";
  if (index === 1 && item.name === "无畏契约排位组队") return "Valorant 速配";
  if (index === 2 && item.name === "CPA 财管晚间共学") return "CPA 学习组";
  return item.name;
};

export default function HomeView({ cards, selectedActivity, onRefresh, onSelect, onStart }: HomeViewProps) {
  return <div className="workspace-view home-view reference-home">
    <section className="reference-hero">
      <div className="reference-title-row">
        <h1>今天，遇见同频的人</h1>
        <button className="refresh-home" onClick={onRefresh}><Icon name="refresh-cw" size="sm"/>换一批</button>
      </div>
      <button className={`urgent-banner ${selectedActivity === "麻将三缺一" ? "selected" : ""}`} onClick={() => onSelect("麻将三缺一")}>
        <span><Icon name="clock" size="lg"/></span><b>麻将三缺一 · 19:30 截止</b><small>当前还有 1 个名额，快来凑局！</small>
      </button>
    </section>
    <section className="reference-cards" aria-label="实时活动">
      {cards.map((item, index) => <button key={item.name} className={`reference-card ${["badminton", "valorant", "cpa"][index]} ${selectedActivity === item.name ? "selected" : ""}`} onClick={() => onSelect(item.name)}>
        <span className="reference-icon">{item.icon}</span>
        <div>
          <h3>{displayName(item, index)}</h3>
          <p><Icon name="map-pin" size="xs"/>{(item.scene || "offline") === "online" ? "线上开黑" : (item.scene || "offline") === "study" ? "图书馆自习区" : "杭城大学城"}{" · "}<Icon name="users" size="xs"/>{index + 2}/{index + 4} 人</p>
          <em>{item.note}</em>
          <footer><span>{item.category}</span><span>{index === 1 ? "晚间时段" : "本周可约"}</span><span>{item.group}</span></footer>
        </div>
      </button>)}
    </section>
    <button className="reference-match-button" onClick={onStart}>开始匹配</button>
    <p className="reference-safe"><Icon name="shield-check" size="sm"/>真人认证 · 隐私保护 · 安全可靠</p>
  </div>;
}
