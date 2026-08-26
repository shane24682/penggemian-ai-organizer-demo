import type { ReactNode } from "react";
import Icon from "@/components/Icon";
import type { Coordinate } from "@/lib/location";
import type { View } from "../types";

type WorkspaceShellProps = {
  view: View;
  location: Coordinate;
  children: ReactNode;
  onNavigate: (view: View) => void;
  onOpenLocation: () => void;
  onSearch: () => void;
  onNotify: (message: string) => void;
};

const primaryNavigation: Array<{ view: View; icon: "home" | "heart" | "users"; label: string }> = [
  { view: "home", icon: "home", label: "发现" },
  { view: "match", icon: "heart", label: "匹配" },
  { view: "friends", icon: "users", label: "好友" },
];

const profileViews: View[] = ["profile", "friendCode", "security", "verification", "tags", "review", "history"];

export default function WorkspaceShell({ view, location, children, onNavigate, onOpenLocation, onSearch, onNotify }: WorkspaceShellProps) {
  return <section className="product-intro app-workspace">
    <div className="workspace-frame">
      <aside className="workspace-rail" aria-label="工作台快捷导航">
        <button className="rail-logo" onClick={() => onNavigate("home")}>碰</button>
        {primaryNavigation.map(item => <button key={item.view} className={view === item.view ? "active" : ""} onClick={() => onNavigate(item.view)}><span><Icon name={item.icon} size="sm"/></span>{item.label}</button>)}
        <div className="rail-spacer"/>
        <button className={profileViews.includes(view) ? "active" : ""} onClick={() => onNavigate("profile")}><span><Icon name="user" size="sm"/></span>我的</button>
        <div className="rail-trust">🌿<small>真实校园 · 安全守护<br/>遇见同频的你</small></div>
      </aside>
      <div className={`workspace-main view-${view}`}>
        <div className="workspace-top">
          <button className="workspace-location" onClick={onOpenLocation}><Icon name="map-pin" size="sm"/><span>{location.label}<small>仅本机用于距离计算 · 对外模糊显示</small></span></button>
          <div><button aria-label="搜索活动" onClick={onSearch}><Icon name="search" size="sm"/></button><button aria-label="消息" onClick={() => onNotify("暂无新消息")}><Icon name="bell" size="sm"/></button><b>Y</b></div>
        </div>
        {children}
      </div>
    </div>
  </section>;
}
