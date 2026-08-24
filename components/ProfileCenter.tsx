"use client";

export type ProfileDestination = "friendCode" | "security" | "verification" | "tags" | "review";

type Props = {
  verificationStatus: "unverified" | "reviewing" | "verified";
  tagCount: number;
  activityCount: number;
  onNavigate: (destination: ProfileDestination) => void;
};

export default function ProfileCenter({ verificationStatus, tagCount, activityCount, onNavigate }: Props) {
  const verificationLabel = verificationStatus === "verified" ? "校园已认证" : verificationStatus === "reviewing" ? "认证审核中" : "待完成校园认证";
  return (
    <section className="workspace-view">
      <div className="profile-center">
        <div className="profile-hero">
          <div><p className="profile-kicker">MY CAMPUS SPACE</p><h1>我的碰个面</h1><p>标签决定推荐，复盘沉淀关系与长期小组。</p></div>
          <div className="profile-badge">{verificationLabel}</div>
        </div>
        <div className="profile-grid">
          <button className="profile-action" onClick={() => onNavigate("tags")}><strong>个人标签 {tagCount ? `· ${tagCount}` : ""} →</strong><small>选择兴趣、性格与学习方式；用于语义推荐同频活动和候选人。</small></button>
          <button className="profile-action" onClick={() => onNavigate("review")}><strong>活动复盘 {activityCount ? `· ${activityCount}` : ""} →</strong><small>完成后评价、双向添加好友、复组或创建长期小组。</small></button>
          <button className="profile-action" onClick={() => onNavigate("friendCode")}><strong>好友码与邀请 →</strong><small>分享校园好友码，邀请同学加入；好友关系仍以活动后双向选择为主。</small></button>
          <button className="profile-action" onClick={() => onNavigate("verification")}><strong>校园认证 →</strong><small>学信网、录取通知书或学生证认证入口。</small></button>
          <button className="profile-action" onClick={() => onNavigate("security")}><strong>账号与安全 →</strong><small>隐私范围、黑名单与匹配安全设置。</small></button>
        </div>
      </div>
    </section>
  );
}
