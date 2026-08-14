"use client";

import { useMemo, useState } from "react";

type Step = 1 | 2 | 3 | 4;
type View = "home" | "match" | "plaza" | "partners" | "business";

const activities = [
  ["摄影入门", "兴趣技能", "摄", "零基础带拍 · 作品点评", "6人 · ¥29"],
  ["一起看电影", "轻娱乐", "影", "选片投票 · 映后聊天", "8人 · ¥25"],
  ["桌游组局", "轻娱乐", "桌", "规则教学 · 自动凑桌", "6人 · ¥35"],
  ["台球新手局", "运动", "台", "同水平匹配 · 球桌预订", "4人 · ¥22"],
  ["羽毛球", "运动", "羽", "水平分层 · 场地用球", "6人 · ¥18"],
  ["篮球半场", "运动", "篮", "位置匹配 · 自动补位", "10人 · ¥12"],
  ["乐器合奏", "社团兴趣", "乐", "曲目与声部匹配", "5人 · 免费"],
  ["舞蹈体验", "社团兴趣", "舞", "零基础教学 · 镜房", "12人 · ¥19"],
  ["城市漫游", "探索", "走", "白天路线 · 真人领队", "8人 · ¥15"],
  ["读书会", "学习", "书", "共读章节 · 主题讨论", "8人 · 免费"],
  ["英语口语角", "学习", "EN", "同水平话题 · 固定复组", "10人 · 免费"],
  ["飞盘体验", "运动", "飞", "规则教学 · 装备用品", "12人 · ¥16"],
];

const people = [
  ["林小满", "大三 · 入门对打", "守约 98%", "林"],
  ["周屿", "大二 · 入门对打", "守约 96%", "周"],
  ["孟然", "研一 · 轻松练习", "守约 100%", "孟"],
  ["陈一禾", "大三 · 入门对打", "守约 94%", "陈"],
  ["许诺", "大二 · 轻松练习", "守约 97%", "许"],
];

const activityCopy: Record<string, string> = {
  羽毛球: "打羽毛球，找入门水平",
  摄影入门: "学摄影但没有门路，想找人带着实拍",
  一起看电影: "找人一起看电影，映后聊一会儿",
  桌游组局: "玩桌游，希望有人教规则并自动凑桌",
  台球新手局: "打台球，想找同水平的新手",
};

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [step, setStep] = useState<Step>(1);
  const [activity, setActivity] = useState("羽毛球");
  const [time, setTime] = useState("周六 15:00");
  const [level, setLevel] = useState("新手友好");
  const [seats, setSeats] = useState(6);
  const [answer, setAnswer] = useState("提前4小时可取消");
  const [category, setCategory] = useState("全部");
  const [partner, setPartner] = useState("学生社团");
  const [toast, setToast] = useState("");
  const progress = useMemo(() => (step / 4) * 100, [step]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const openMatch = (name?: string) => {
    if (name) setActivity(name);
    setStep(1);
    setView("match");
  };

  const navItems: Array<[View, string, string]> = [
    ["home", "⌂", "首页"], ["match", "✦", "开始匹配"],
    ["plaza", "◫", "活动广场"], ["partners", "♧", "组织"],
  ];

  return <main>
    <header className="nav app-nav">
      <button className="brand" onClick={()=>setView("home")}><span className="brand-mark">碰</span><span>碰个面</span><em>AI 主理人</em></button>
      <nav aria-label="主导航">
        <button onClick={()=>setView("plaza")}>活动广场</button>
        <button className="nav-match" onClick={()=>openMatch()}>开始匹配</button>
        <button onClick={()=>setView("partners")}>机构接入</button>
        <button onClick={()=>setView("business")}>品牌合作</button>
      </nav>
      <button className="campus-pill" onClick={()=>notify("已切换为：杭州大学城")}>⌖ 杭州大学城⌄</button>
    </header>

    <section className="product-intro app-workspace">
      <div className="workspace-frame">
        <aside className="workspace-rail" aria-label="工作台快捷导航">
          <button className="rail-logo" onClick={()=>setView("home")}>碰</button>
          {navItems.map(([id,icon,label])=><button key={id} className={`${view===id?"active":""} ${id==="match"?"match-entry":""}`} onClick={()=>id==="match"?openMatch():setView(id)}><span>{icon}</span>{id==="match"?<strong>{label}</strong>:label}</button>)}
          <i />
          <button onClick={()=>notify("消息中心暂无新提醒")}><span>◌</span>消息</button>
          <button onClick={()=>notify("个人主页 Demo")}><span>○</span>我的</button>
        </aside>

        <div className={`workspace-main view-${view}`}>
          <div className="workspace-top"><span>8月14日 · 杭州大学城</span><div><button aria-label="搜索" onClick={()=>notify("搜索 Demo")}>⌕</button><button aria-label="消息" onClick={()=>notify("暂无新消息")}>♧</button><b>Y</b></div></div>

          {view === "home" && <div className="workspace-view home-view">
            <div className="welcome"><span>GOOD AFTERNOON</span><h1>今天，想碰见什么？</h1><p>你说一句，AI 主理人替你把人、场地和规则都安排好。</p></div>
            <div className="command-bar"><span>✦</span><button onClick={()=>openMatch("摄影入门")}>试试说：“周六想学摄影，零基础，希望有人带”</button><i>↑</i></div>
            <div className="dashboard-grid">
              <article className="quote-card"><em>今日灵感</em><b>“兴趣不是等人教会，<br/>而是找到人一起开始。”</b><span>换一句　♡ 收藏</span></article>
              <article className="today-card"><em>我的下一局</em><b>羽毛球新手局</b><p>周六 15:00 · 东区体育馆</p><div><span>林</span><span>周</span><span>孟</span><i>3/6</i></div><button onClick={()=>{setStep(3);setView("match")}}>查看进度 →</button></article>
              <article className="signal-card"><em>本校正在发生</em><b>18</b><p>个活动正在招募</p><span>摄影入门最热门 ↗</span></article>
              <article className="feature-card"><div><em>为你推荐</em><b>零基础校园摄影漫步</b><p>摄影社带队 · 手机也能参加</p><button onClick={()=>openMatch("摄影入门")}>去看看</button></div><span className="sun-orb">摄</span></article>
            </div>
          </div>}

          {view === "match" && <div className="workspace-view embedded-view match-view">
            <div className="view-heading"><div><span>LIVE PRODUCT DEMO</span><h2>完成一次“AI 成局”</h2><p>当前内容区直接切换，外层工作台不会跳转。</p></div><b>{step}/4<small>当前进度</small></b></div>
            <div className="progress"><i style={{width:`${progress}%`}} /></div>
            <div className="demo-shell">
              <aside>{[[1,"告诉AI"],[2,"确认偏好"],[3,"匹配结果"],[4,"成局成功"]].map(([n,label])=><button key={n} className={step===n?"active":step>n?"done":""} onClick={()=>setStep(n as Step)}><span>{step>n?"✓":n}</span>{label}</button>)}<div className="agent-info"><span className="ai-avatar">碰</span><div><b>AI主理人正在工作</b><p>已为你节省约 42 分钟沟通</p></div></div></aside>
              <div className="demo-content">
                {step===1&&<div className="panel enter-panel"><span className="panel-tag">STEP 01</span><h3>你想和同学一起做什么？</h3><p>不用填写复杂表单，一句话就够了。</p><div className="idea-input"><span>✦</span><textarea value={`这周六下午想${activityCopy[activity]||`参加${activity}`}，希望规则和费用提前说清楚。`} readOnly/><button onClick={()=>setStep(2)}>交给 AI 安排 →</button></div><div className="ideas"><span>换个想法：</span>{["摄影入门","一起看电影","桌游组局","台球新手局"].map(x=><button className={activity===x?"selected":""} key={x} onClick={()=>setActivity(x)}>{x}</button>)}</div></div>}
                {step===2&&<div className="panel preference-panel"><span className="panel-tag">STEP 02</span><h3>我理解得对吗？</h3><p>确认真正影响成局的硬条件。</p><div className="form-grid"><label>活动主题<select value={activity} onChange={e=>setActivity(e.target.value)}>{activities.map(x=><option key={x[0]}>{x[0]}</option>)}</select></label><label>时间<select value={time} onChange={e=>setTime(e.target.value)}><option>周六 15:00</option><option>周六 19:00</option><option>周日 10:00</option></select></label><label>水平 / 目标<select value={level} onChange={e=>setLevel(e.target.value)}><option>新手友好</option><option>同水平参与</option><option>固定互相监督</option></select></label><label>理想人数<div className="stepper"><button onClick={()=>setSeats(Math.max(4,seats-1))}>−</button><b>{seats} 人</b><button onClick={()=>setSeats(Math.min(10,seats+1))}>＋</button></div></label></div><div className="question"><b>把活动规则先说清楚</b><p>选择最重要的一条约定</p><div>{["提前4小时可取消","各自AA，不代付","不强社交，按时结束"].map(x=><button key={x} className={answer===x?"selected":""} onClick={()=>setAnswer(x)}>{x}</button>)}</div></div><button className="wide-button" onClick={()=>setStep(3)}>开始智能匹配 <span>预计 8 秒</span></button></div>}
                {step===3&&<div className="panel result-panel"><span className="panel-tag success">规则已确认 · 同校成员已核验</span><div className="result-title"><div><h3>{level}{activity}局</h3><p>{time} · 校内合作场地 · {seats}人小组</p></div><span className="price">¥18<small>/席</small></span></div><div className="people-grid">{people.slice(0,seats-1).map((p,i)=><div className="person" key={p[0]}><span className={`portrait p${i}`}>{p[3]}</span><div><b>{p[0]}</b><p>{p[1]}</p></div><em>{p[2]}</em></div>)}</div><div className="captain"><span>队</span><div><b>真人队长：阿野</b><p>已带队 23 场 · 评分 4.9</p></div><em>身份已认证</em></div><div className="included"><b>席位包含</b><span>✓ 场地</span><span>✓ 水平分组</span><span>✓ AI提醒及候补</span></div><button className="wide-button pay" onClick={()=>setStep(4)}>确认并购买席位 · ¥18 <span>模拟支付 →</span></button><p className="fine-print">Demo不会产生真实扣款</p></div>}
                {step===4&&<div className="panel done-panel"><div className="checkmark">✓</div><span className="panel-tag success">已成功占座</span><h3>这一局，交给我们。</h3><p>AI主理人会处理确认、补位与提醒。</p><div className="ticket"><div className="ticket-main"><span className="sport-icon">碰</span><div><b>{level}{activity}局</b><p>{time} · 校内合作场地</p></div><strong>{seats}/{seats}<br/><small>已成局</small></strong></div><div className="ticket-code"><div className="fake-qr">▦</div><div><b>签到码 2861</b><p>活动前30分钟开放</p></div><button onClick={()=>notify("活动已加入日历")}>加入日历</button></div></div><div className="next-actions"><button onClick={()=>notify("邀请链接已复制")}>邀请同学</button><button onClick={()=>openMatch()}>再开一局</button></div></div>}
              </div>
            </div>
          </div>}

          {view === "plaza" && <div className="workspace-view embedded-view plaza-view"><div className="view-heading"><div><span>CAMPUS ACTIVITY PLAZA</span><h2>活动广场</h2><p>从第一次学摄影到乐队合奏，选择一个想参加的活动。</p></div></div><div className="category-tabs">{["全部","运动","轻娱乐","兴趣技能","社团兴趣","学习","探索"].map(x=><button key={x} className={category===x?"active":""} onClick={()=>setCategory(x)}>{x}</button>)}</div><div className="activity-grid">{activities.filter(x=>category==="全部"||x[1]===category).map((x,i)=><button className="activity-card" key={x[0]} onClick={()=>openMatch(x[0])}><span className={`activity-icon c${i%5}`}>{x[2]}</span><div><em>{x[1]}</em><h3>{x[0]}</h3><p>{x[3]}</p><b>{x[4]}</b></div><i>开始匹配 →</i></button>)}</div></div>}

          {view === "partners" && <div className="workspace-view embedded-view partner-view"><div className="view-heading"><div><span>CAMPUS PARTNER NETWORK</span><h2>机构接入</h2><p>社团、校园墙和场地商家接入同一个活动网络。</p></div></div><div className="partner-shell"><div className="partner-tabs">{["学生社团","校园墙","场地商家"].map(x=><button className={partner===x?"active":""} key={x} onClick={()=>setPartner(x)}>{x}</button>)}</div><div className="partner-content"><div className="partner-copy"><span className="partner-type">{partner}接入空间</span><h3>{partner==="学生社团"?"把一次招新，变成持续活动供给":partner==="校园墙"?"从发布信息，升级为可报名的校园频道":"把空闲场地，变成稳定的学生订单"}</h3><p>{partner==="学生社团"?"乐器社、舞蹈社、摄影社等获得认证主页；AI处理报名、收费、候补、签到和复盘。":partner==="校园墙"?"帖子可一键转为结构化活动卡，按学校分发并追踪报名与到场。":"台球厅、桌游店、影院和球馆可发布校园时段，自动拼场。"}</p><div className="partner-benefits"><span>✓ 认证主页</span><span>✓ 一键分发</span><span>✓ 候补签到</span><span>✓ 收益结算</span></div><button onClick={()=>notify(`${partner}接入申请 Demo 已提交`)}>申请接入 →</button></div><div className="org-preview"><div className="org-head"><span>{partner==="学生社团"?"乐":partner==="校园墙"?"墙":"店"}</span><div><b>{partner==="学生社团"?"杭城大学吉他社":partner==="校园墙"?"杭城大学校园墙":"南门青年台球俱乐部"}</b><p>负责人已认证 · 本校可见</p></div><em>已接入</em></div><div className="org-stats"><div><b>1,286</b><span>关注学生</span></div><div><b>32</b><span>已完成活动</span></div><div><b>91%</b><span>平均到场率</span></div></div><div className="org-event"><span>本周活动</span><b>{partner==="学生社团"?"零基础吉他合奏体验":partner==="校园墙"?"周五校园露天电影夜":"台球新手四人练习局"}</b><p>AI已完成场地、规则和报名配置</p><button onClick={()=>notify("已加入活动候补名单")}>查看并报名</button></div></div></div></div></div>}

          {view === "business" && <div className="workspace-view embedded-view business-view"><div className="view-heading"><div><span>FOR BRAND & VENUE</span><h2>品牌合作</h2><p>按真实到场、商品体验与成交结果获得校园增长。</p></div></div><div className="business-dashboard"><div><h3>每次成局，都是一次真实消费。</h3><p>席位、场地、物资与天猫商品在同一订单链路中完成。</p><div className="stats"><div><b>同校</b><span>身份已核验</span></div><div><b>守约率</b><span>活动后沉淀</span></div><div><b>全链路</b><span>报名至核销</span></div></div><button onClick={()=>notify("合作方案：按到场、核销或成交结算")}>查看合作方案 →</button></div><div className="funnel-card"><div className="funnel-head"><div><span className="brand-dot">N</span><div><b>运动品牌校园体验局</b><p>演示数据 · 杭州 · 5所高校</p></div></div><em>模拟看板</em></div><div className="metric-row"><div><span>活动场次</span><b>24</b></div><div><span>真实到场</span><b>386</b></div><div><span>天猫成交</span><b>¥28.6k</b></div></div><div className="bars"><span style={{height:"48%"}}/><span style={{height:"68%"}}/><span style={{height:"60%"}}/><span style={{height:"87%"}}/><span style={{height:"72%"}}/><span style={{height:"94%"}}/></div></div></div></div>}

          <div className="workspace-dock"><button onClick={()=>setView("plaza")}>◫<span>发现活动</span></button><button className="match-dock" onClick={()=>openMatch()}>✦<span>开始匹配</span></button><button onClick={()=>setView("partners")}>♧<span>机构接入</span></button></div>
        </div>
      </div>
    </section>
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>;
}
