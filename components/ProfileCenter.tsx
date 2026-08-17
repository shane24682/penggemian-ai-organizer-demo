"use client";

import type { MbtiResult } from "../lib/mbti";

export type ProfileDestination = "friendCode" | "security" | "verification" | "quiz" | "friends" | "history";

type Props = {
  mbti: MbtiResult | null;
  verificationStatus: "unverified" | "reviewing" | "verified";
  friendCount: number;
  activityCount: number;
  onNavigate: (destination: ProfileDestination) => void;
  onNotify: (message: string) => void;
};

export default function ProfileCenter({ mbti, verificationStatus, friendCount, activityCount, onNavigate, onNotify }: Props) {
  const statusText = verificationStatus === "verified" ? "大学生已认证" : verificationStatus === "reviewing" ? "认证审核中" : "等待大学生认证";
  return <div className="profile-view">
    <div className="profile-cover"><div className="profile-cover-glow"/><div className="profile-cover-top"><span>MY CAMPUS SPACE</span><button onClick={()=>onNavigate("friendCode")}>▦ 好友码</button><button onClick={()=>onNavigate("security")}>⚙ 账号与安全</button></div><div className="profile-card"><span className="profile-avatar">Y</span><div className="profile-copy"><div><h1>Young</h1><em>PG20260814</em></div><p>杭城大学 · 大三 · 产品与AI方向</p><div className="profile-stats"><span><b>{friendCount}</b>好友</span><span><b>{activityCount}</b>参加活动</span><span><b>97%</b>守约率</span></div><div className="profile-tags"><span className="verified-tag">✓ {statusText}</span>{mbti && <span>{mbti.type} · {mbti.title}</span>}<span>摄影</span><span>羽毛球</span><span>桌游</span><button onClick={()=>onNotify("标签编辑面板 Demo")}>＋</button></div></div></div></div>
    <div className="profile-dashboard">
      <section className="profile-main-card"><div className="profile-section-head"><div><span>PERSONALITY & PREFERENCE</span><h2>更懂你，匹配才更自然</h2></div><button onClick={()=>onNavigate("quiz")}>进入测试中心 →</button></div><div className="profile-personality-grid"><button onClick={()=>onNavigate("quiz")}><span>活</span><div><b>活动性格测试</b><p>用场景题判断你更适合怎样的校园活动</p></div><em>已生成推荐</em></button><button onClick={()=>onNavigate("quiz")}><span className="dark">{mbti?.type.slice(0,1) || "M"}</span><div><b>MBTI 社交偏好</b><p>{mbti ? `${mbti.type} · ${mbti.title}` : "12题，结果进入匹配标签"}</p></div><em>{mbti ? "查看报告" : "去测试"}</em></button></div></section>
      <aside className="profile-menu-card"><button onClick={()=>onNavigate("friendCode")}><span>▦</span><div><b>我的好友码</b><p>扫码添加好友 · 含校验算法</p></div><em>→</em></button><button onClick={()=>onNavigate("verification")}><span>✓</span><div><b>大学生认证</b><p>学信网 / 录取通知书 / 身份证</p></div><i className={`profile-status ${verificationStatus}`}>{statusText}</i></button><button onClick={()=>onNavigate("friends")}><span>◎</span><div><b>好友与申请</b><p>搜索ID、扫一扫、处理好友申请</p></div><em>→</em></button><button onClick={()=>onNavigate("history")}><span>↺</span><div><b>活动记录</b><p>查看成局、签到和日历记录</p></div><em>→</em></button></aside>
    </div>
    <div className="profile-trust-strip"><div><span>校园信任档案</span><h3>认证、守约和活动记录共同构成可信身份</h3></div><div><b>6</b><span>完成活动</span></div><div><b>0</b><span>爽约次数</span></div><div><b>4.9</b><span>同伴评价</span></div><button onClick={()=>onNotify("信任档案仅在成局时展示必要信息")}>隐私说明 →</button></div>
  </div>;
}
