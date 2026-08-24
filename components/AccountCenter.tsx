"use client";

import { FormEvent, useState } from "react";
import Icon from "./Icon";

type VerificationStatus = "unverified" | "reviewing" | "verified";

type Props = {
  mode: "security" | "verification";
  verificationStatus: VerificationStatus;
  onBack: () => void;
  onOpenVerification: () => void;
  onStatusChange: (status: VerificationStatus) => void;
  onNotify: (message: string) => void;
};

export default function AccountCenter({ mode, verificationStatus, onBack, onOpenVerification, onStatusChange, onNotify }: Props) {
  const [loginProtection, setLoginProtection] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("penggemian-login-protection") === "true"
  );
  const [method, setMethod] = useState<"chsi" | "admission" | "id">("chsi");
  const [realName, setRealName] = useState("");
  const [school, setSchool] = useState("杭城大学");
  const [documentName, setDocumentName] = useState("");
  const [agreed, setAgreed] = useState(false);

  if (mode === "security") {
    const score = 55 + (loginProtection ? 15 : 0) + (verificationStatus === "verified" ? 30 : verificationStatus === "reviewing" ? 15 : 0);
    return <div className="security-view"><div className="security-head"><button onClick={onBack}><Icon name="arrow-left" size="sm"/>返回我的</button><div><span>ACCOUNT & SAFETY</span><h2>账号与安全</h2></div></div><div className="security-score"><span><Icon name="zap" size="lg"/></span><div><small>当前安全等级</small><h2>{score >= 85 ? "高" : score >= 70 ? "中" : "待完善"}</h2><p>完成大学生身份认证并开启登录保护，可提升账号可信度。</p></div><b>{score}<small>/100</small></b></div><section className="security-list"><button onClick={()=>onNotify("手机号换绑流程 Demo")}><span><Icon name="smartphone" size="sm"/></span><div><b>手机号绑定</b><p>用于登录和异常验证</p></div><em>138****0814 →</em></button><button onClick={()=>onNotify("密码设置流程 Demo")}><span><Icon name="key-round" size="sm"/></span><div><b>账号密码</b><p>定期更新密码，降低账号风险</p></div><em>已设置 →</em></button><button onClick={onOpenVerification}><span><Icon name="badge-check" size="sm"/></span><div><b>大学生认证</b><p>学信网、录取通知书或证件组合核验</p></div><em>{verificationStatus === "verified" ? "已认证" : verificationStatus === "reviewing" ? "审核中" : "未认证"} →</em></button><button onClick={()=>onNotify("实名认证需要服务端OCR和人证比对，当前仅展示流程")}><span><Icon name="id-card" size="sm"/></span><div><b>本人实名认证</b><p>身份证信息只用于身份核验</p></div><em>{verificationStatus === "verified" ? "已完成" : "待完成"} →</em></button><button onClick={()=>{const next=!loginProtection;setLoginProtection(next);localStorage.setItem("penggemian-login-protection",String(next));onNotify(next?"登录保护已开启":"登录保护已关闭")}}><span><Icon name="lock" size="sm"/></span><div><b>登录保护</b><p>新设备登录需短信二次确认</p></div><i className={loginProtection ? "switch on" : "switch"}><b/></i></button></section><div className="security-foot"><button onClick={()=>onNotify("账号注销需二次身份确认和7天冷静期")}>申请注销账号</button><p>Demo不会收集真实手机号、身份证号或证件图片。</p></div></div>;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!realName.trim() || !school.trim() || !agreed || (method !== "chsi" && !documentName)) {
      onNotify("请完成姓名、学校、认证材料和授权确认");
      return;
    }
    onStatusChange("reviewing");
    localStorage.setItem("penggemian-verification", JSON.stringify({ status: "reviewing", method, school, submittedAt: new Date().toISOString() }));
    onNotify("认证材料已进入模拟审核；证件原图没有保存");
  };

  return <div className="verification-view"><div className="security-head"><button onClick={onBack}><Icon name="arrow-left" size="sm"/>返回账号与安全</button><div><span>STUDENT VERIFICATION</span><h2>大学生身份认证</h2></div></div><div className="verification-intro"><div><span><Icon name="badge-check" size="md"/></span><div><h2>认证后，只匹配可信的同校同学</h2><p>认证结果用于校园身份、同校匹配和安全风控；不会在个人主页展示证件信息。</p></div></div><b>{verificationStatus === "reviewing" ? "审核中" : verificationStatus === "verified" ? "已认证" : "未认证"}</b></div><form className="verification-form" onSubmit={submit}><section><span>01 · 基本信息</span><div className="verification-fields"><label>本人真实姓名<input value={realName} onChange={event=>setRealName(event.target.value)} placeholder="仅用于认证比对"/></label><label>就读学校<input value={school} onChange={event=>setSchool(event.target.value)} placeholder="输入学校全称"/></label></div></section><section><span>02 · 选择认证方式</span><div className="verification-methods"><button type="button" className={method==="chsi"?"selected":""} onClick={()=>{setMethod("chsi");setDocumentName("")}}><i>学</i><div><b>学信网授权</b><p>推荐 · 通过学籍在线验证结果核验</p></div><em><Icon name={method==="chsi"?"check":"chevron-right"} size="sm"/></em></button><button type="button" className={method==="admission"?"selected":""} onClick={()=>setMethod("admission")}><i>录</i><div><b>录取通知书</b><p>适合新生 · 配合本人身份证审核</p></div><em><Icon name={method==="admission"?"check":"chevron-right"} size="sm"/></em></button><button type="button" className={method==="id"?"selected":""} onClick={()=>setMethod("id")}><i>证</i><div><b>学生证 + 本人身份证</b><p>人工复核 · 关键信息可加水印</p></div><em><Icon name={method==="id"?"check":"chevron-right"} size="sm"/></em></button></div>{method === "chsi" ? <button type="button" className="chsi-button" onClick={()=>{setDocumentName("学信网授权记录（Demo）");onNotify("已模拟完成学信网授权")}}>前往学信网授权（Demo） →</button> : <label className="document-upload"><input type="file" accept="image/*,.pdf" onChange={event=>setDocumentName(event.target.files?.[0]?.name || "")}/><span><Icon name="plus" size="md"/></span><div><b>{documentName || "选择认证材料"}</b><p>仅在本次页面读取文件名，不上传、不缓存证件图片</p></div><em>选择文件</em></label>}</section><section><span>03 · 隐私授权</span><label className="verification-consent"><input type="checkbox" checked={agreed} onChange={event=>setAgreed(event.target.checked)}/><i><Icon name="check" size="xs"/></i><p>我确认提交的是本人信息，并同意仅为校园身份认证进行必要核验。Demo不会上传证件；正式产品需加密传输、最小化保存并提供删除机制。</p></label></section><button className="verification-submit" type="submit">提交认证审核 →</button><small>正式上线前需要接入合规实名服务、OCR/活体检测或官方授权渠道；本页目前只验证产品流程和交互。</small></form></div>;
}
