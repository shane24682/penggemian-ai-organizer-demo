import type { ReactNode } from "react";
import Icon, { type IconName } from "@/components/Icon";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Coordinate } from "@/lib/location";
import type { View } from "../types";

type WorkspaceShellProps = {
  view: View;
  location: Coordinate;
  children: ReactNode;
  onNavigate: (view: View) => void;
  onOpenLocation: () => void;
  onSearch: () => void;
};

const primaryNavigation: Array<{ view: View; icon: IconName; label: string }> = [
  { view: "home", icon: "home", label: "发现" },
  { view: "match", icon: "heart", label: "匹配" },
  { view: "workflow", icon: "users", label: "数模活动" },
  { view: "requests", icon: "calendar", label: "需求" },

  { view: "friends", icon: "users", label: "好友" },
];

const profileViews: View[] = ["profile", "friendCode", "security", "verification", "tags", "review", "history"];

export default function WorkspaceShell({ view, location, children, onNavigate, onOpenLocation, onSearch }: WorkspaceShellProps) {
  const { user, logout } = useAuth();


  return <section className="product-intro app-workspace">
    <div className="workspace-frame">
      <aside className="workspace-rail" aria-label="工作台快捷导航">
        <button className="rail-logo" onClick={() => onNavigate("home")}>碰</button>
        {primaryNavigation.map(item => <button key={item.view} className={view === item.view ? "active" : ""} onClick={() => onNavigate(item.view)}><span><Icon name={item.icon} size="sm"/></span>{item.label}</button>)}
        {user && user.role !== "USER" && <button className={view === "ops" ? "active" : ""} onClick={() => onNavigate("ops")}><span><Icon name="calendar" size="sm"/></span>运营</button>}
        <div className="rail-spacer"/>
        <button className={profileViews.includes(view) ? "active" : ""} onClick={() => onNavigate("profile")}><span><Icon name="user" size="sm"/></span>我的</button>
        <div className="rail-trust">🌿<small>真实校园 · 安全守护<br/>遇见同频的你</small></div>
      </aside>
      <div className={`workspace-main view-${view}`}>
        <div className="workspace-top">
          <button className="workspace-location" onClick={onOpenLocation}><Icon name="map-pin" size="sm"/><span>{location.label}<small>仅本机用于距离计算 · 对外模糊显示</small></span></button>
          <div className="workspace-tools">
            <button aria-label="搜索活动" onClick={onSearch}><Icon name="search" size="sm"/></button>
            <button aria-label="消息" onClick={() => onNavigate("workflow")}><Icon name="bell" size="sm"/></button>
            <div className="workspace-account">
              <span aria-hidden="true">{user?.displayName.slice(0, 1) || "碰"}</span>
              <div><b>{user?.displayName}</b><small>{user?.role === "USER" ? "校园用户" : user?.role}</small></div>
              <button type="button" onClick={() => logout()} aria-label="退出当前账号">退出</button>
            </div>
          </div>

        </div>
        {children}
      </div>
    </div>
  </section>;
}
