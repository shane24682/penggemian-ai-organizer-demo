"use client";

import Icon from "./Icon";

export type AudienceRules = {
  sameCampus: boolean;
  womenOnly: boolean;
  friendsOnly: boolean;
  hideContacts: boolean;
};

type Props = {
  value: AudienceRules;
  onChange: (value: AudienceRules) => void;
  onNotify: (message: string) => void;
};

export default function SafetyControls({ value, onChange, onNotify }: Props) {
  const toggle = (key: keyof AudienceRules) => {
    if (key === "sameCampus") { onNotify("校园活动必须保持同校认证筛选"); return; }
    onChange({ ...value, [key]: !value[key] });
  };

  const rules: Array<[keyof AudienceRules, string, string]> = [
    ["sameCampus", "仅同校认证", "必须通过大学生身份认证"],
    ["womenOnly", "女生局", "只邀请认证为女性的同校用户"],
    ["friendsOnly", "仅好友可见", "不进入公开活动推荐"],
    ["hideContacts", "屏蔽通讯录", "不匹配通讯录与指定用户"],
  ];

  return <div className="safety-controls">
    <div className="safety-title"><div><b>隐私与参与范围</b><p>匹配前只展示必要信息，用户可以控制谁能看见和参与。</p></div><span>安全优先</span></div>
    <div className="safety-rule-grid">{rules.map(([key, title, note]) => <button key={key} className={value[key] ? "selected" : ""} onClick={() => toggle(key)}><i><Icon name={value[key] ? "check" : "shield-check"} size="sm"/></i><div><b>{title}</b><p>{note}</p></div></button>)}</div>
    <div className="privacy-boundary"><span>成局前：同校 · 约1—3km</span><span>确认后：展示活动场地</span><span>始终隐藏：宿舍与实时位置</span><button onClick={() => onNotify("已打开举报、拉黑和拒绝再次同局设置")}>举报 / 拉黑设置 →</button></div>
  </div>;
}
