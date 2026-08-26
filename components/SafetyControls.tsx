"use client";

import Icon from "./Icon";
import type { AudienceMode } from "../lib/matching";

type Props = {
  value: AudienceMode;
  onChange: (value: AudienceMode) => void;
  onNotify: (message: string) => void;
};

export default function SafetyControls({ value, onChange, onNotify }: Props) {
  const rules: Array<[AudienceMode, string, string]> = [
    ["campus", "同校局", "不限性别，仅邀请同校认证用户"],
    ["men", "男生局", "只邀请认证为男性的同校用户"],
    ["women", "女生局", "只邀请认证为女性的同校用户"],
    ["friends", "好友局", "只向你的同校好友发送邀请"],
  ];

  return <div className="safety-controls">
    <div className="safety-title"><div><b>隐私与参与范围</b><p>匹配前只展示必要信息，用户可以控制谁能看见和参与。</p></div><span>安全优先</span></div>
    <div className="safety-rule-grid">{rules.map(([key, title, note]) => <button key={key} className={value === key ? "selected" : ""} aria-pressed={value === key} onClick={() => onChange(key)}><i><Icon name={value === key ? "check" : "shield-check"} size="sm"/></i><div><b>{title}</b><p>{note}</p></div></button>)}</div>
    <div className="privacy-boundary"><span>全部模式：必须同校认证</span><span>成局前：仅展示距离区间</span><span>始终隐藏：宿舍与实时位置</span><button onClick={() => onNotify("已打开屏蔽通讯录、举报、拉黑和拒绝再次同局设置")}>高级隐私与安全设置 →</button></div>
  </div>;
}
