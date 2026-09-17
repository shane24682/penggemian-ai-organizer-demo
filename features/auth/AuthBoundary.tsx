"use client";

import { FormEvent, useState, type ReactNode } from "react";

import { ApiRequestError } from "@/lib/p0-api";
import { useAuth } from "./AuthProvider";

type Mode = "login" | "register";

const apiErrorMessage = (error: unknown) =>
  error instanceof ApiRequestError
    ? error.message
    : error instanceof Error
      ? error.message
      : "操作失败，请稍后重试";

function AuthForm() {
  const { error: sessionError, signIn, signUp, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [majorCategory, setMajorCategory] = useState("");
  const [gradeYear, setGradeYear] = useState(1);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const switchMode = (next: Mode) => {
    setMode(next);
    setFormError("");
    clearError();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    clearError();
    try {
      if (mode === "login") {
        await signIn(phone.trim(), password);
      } else {
        await signUp({
          phoneE164: phone.trim(),
          password,
          schoolCode: schoolCode.trim(),
          displayName: displayName.trim(),
          majorCategory: majorCategory.trim(),
          gradeYear,
        });
      }
    } catch (caught) {
      setFormError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-shell">
    <section className="auth-story" aria-label="碰个面产品介绍">
      <div className="auth-brand"><span>碰</span><b>碰个面</b></div>
      <div>
        <small>REAL CAMPUS · REAL TEAM</small>
        <h1>一次登录，管理你发起和加入的每一个局。</h1>
        <p>从发布需求、回应邀请到正式成局，所有进度都集中在你的工作台。</p>
      </div>
      <ul>
        <li><b>01</b><span>发布多条组队需求<small>每条需求独立匹配和成局</small></span></li>
        <li><b>02</b><span>收到邀请，及时回应<small>主选和候补进度一目了然</small></span></li>
        <li><b>03</b><span>统一查看需求与成局<small>随时继续上次的组队进度</small></span></li>
      </ul>
    </section>
    <section className="auth-panel" aria-label={mode === "login" ? "登录" : "注册"}>
      <div className="auth-tabs" role="tablist" aria-label="账号入口">
        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>登录</button>
        <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>注册</button>
      </div>
      <div className="auth-panel-heading">
        <small>{mode === "login" ? "WELCOME BACK" : "CREATE ACCOUNT"}</small>
        <h2>{mode === "login" ? "登录你的校园账号" : "创建碰个面账号"}</h2>
        <p>{mode === "login" ? "登录后继续管理你的需求、邀请和成局。" : "账号身份将用于发布需求、接收邀请和履约记录。"}</p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        {mode === "register" && <>
          <label>显示名称<input required maxLength={64} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="你的名字或昵称" /></label>
          <label>学校代码<input required maxLength={64} autoCapitalize="characters" value={schoolCode} onChange={(event) => setSchoolCode(event.target.value)} placeholder="由学校或运营提供" /></label>
          <div className="auth-form-row">
            <label>专业类别<input required maxLength={64} value={majorCategory} onChange={(event) => setMajorCategory(event.target.value)} placeholder="例如：计算机" /></label>
            <label>年级<select value={gradeYear} onChange={(event) => setGradeYear(Number(event.target.value))}>{Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>第 {index + 1} 年</option>)}</select></label>
          </div>
        </>}
        <label>手机号<input required inputMode="tel" autoComplete="username" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+8613800000001" pattern="\+[1-9][0-9]{7,14}" /></label>
        <label>密码<input required type="password" minLength={mode === "register" ? 8 : 1} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "输入账号密码" : "至少 8 位"} /></label>
        {(formError || sessionError) && <p className="auth-error" role="alert">{formError || sessionError}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? "正在连接服务…" : mode === "login" ? "登录并进入工作台" : "注册并进入工作台"}<span>→</span></button>
      </form>
      <p className="auth-privacy">手机号用于登录与账号验证。</p>
    </section>
  </main>;
}

export default function AuthBoundary({ children }: { children: ReactNode }) {
  const { status, error, restore, logout } = useAuth();

  if (status === "authenticated") return children;
  if (status === "anonymous") return <AuthForm />;

  return <main className="auth-shell auth-state-shell">
    <section className="auth-state-card" role={status === "error" ? "alert" : "status"}>
      <span className="auth-state-mark">碰</span>
      <small>{status === "error" ? "CONNECTION INTERRUPTED" : "RESTORING SESSION"}</small>
      <h1>{status === "error" ? "暂时无法验证登录状态" : "正在恢复你的工作台"}</h1>
      <p>{status === "error" ? error : "正在恢复登录状态，请稍候。"}</p>
      {status === "error" && <div><button onClick={() => void restore()}>重新连接</button><button className="secondary" onClick={() => logout()}>使用其他账号</button></div>}
    </section>
  </main>;
}
