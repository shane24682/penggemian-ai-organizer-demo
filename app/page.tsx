"use client";

import { useMemo, useState } from "react";
import { matchUsers } from "../lib/matching";

type Step = 1 | 2 | 3 | 4;
type View = "home" | "match" | "plaza" | "quiz" | "partners" | "business";

type Activity = {
  name: string;
  category: string;
  group: string;
  icon: string;
  note: string;
  meta: string;
  featured: boolean;
};

const featuredActivities = new Set([
  "羽毛球双打", "飞盘争夺赛", "校园夜跑打卡", "攀岩抱石",
  "密室逃脱", "Switch派对游戏", "台球斯诺克", "城市街拍约拍",
  "乐队合奏", "陶艺拉坯", "外语角", "圆桌读书会",
  "天文台观星", "Citywalk人文历史路线", "露营烧烤",
]);

const activityGroup = (
  category: string,
  group: string,
  icon: string,
  note: string,
  meta: string,
  names: string[],
): Activity[] => names.map(name => ({
  name, category, group, icon, note, meta, featured: featuredActivities.has(name),
}));

const activities: Activity[] = [
  ...activityGroup("运动", "球类运动", "球", "同水平匹配 · 场地与规则确认", "4–12人 · 本校可发起", ["篮球3V3", "羽毛球双打", "乒乓球擂台赛", "网球对拉", "排球沙地赛"]),
  ...activityGroup("运动", "潮流新宠", "潮", "新手教学 · 装备与分队安排", "8–16人 · 新手友好", ["飞盘争夺赛", "腰旗橄榄球", "匹克球体验", "攻防箭"]),
  ...activityGroup("运动", "户外耐力", "跑", "路线规划 · 配速分组与安全提醒", "6–20人 · 领队带队", ["校园夜跑打卡", "环湖骑行", "登山徒步", "城市定向越野"]),
  ...activityGroup("运动", "室内燃脂", "燃", "场馆预约 · 教练与护具确认", "6–12人 · 可拼团", ["攀岩抱石", "蹦床公园", "室内滑冰", "搏击操团课"]),

  ...activityGroup("轻娱乐", "沉浸推理", "谜", "主题投票 · 角色与场次匹配", "5–10人 · 商家供给", ["密室逃脱", "剧本杀", "实景搜证"]),
  ...activityGroup("轻娱乐", "桌游聚会", "桌", "规则教学 · 自动凑桌", "4–10人 · 新手友好", ["麻将三缺一", "狼人杀", "阿瓦隆", "三国杀", "大富翁现金流", "德国心脏病"]),
  ...activityGroup("轻娱乐", "电子竞技", "游", "设备与游戏确认 · 自动补位", "2–10人 · 可开黑", ["Switch派对游戏", "PS5双人成行", "网吧5V5开黑"]),
  ...activityGroup("轻娱乐", "新奇体验", "趣", "场地预约 · 费用提前确认", "2–8人 · 可拼场", ["VR虚拟对战", "射箭", "飞镖", "保龄球", "台球斯诺克"]),

  ...activityGroup("兴趣技能", "视觉艺术", "影", "作品目标匹配 · 社团或同伴带练", "4–8人 · 可交作品", ["城市街拍约拍", "胶片暗房体验", "手机短视频剪辑", "Vlog创作"]),
  ...activityGroup("兴趣技能", "乐器声乐", "乐", "曲目与声部匹配 · 排练室预约", "4–12人 · 社团带练", ["乐队合奏", "阿卡贝拉无伴奏合唱", "尤克里里速成课"]),
  ...activityGroup("兴趣技能", "手工DIY", "作", "材料包预订 · 老师或社团教学", "4–10人 · 材料可团购", ["陶艺拉坯", "奶油胶手机壳", "流体熊", "拼豆豆", "微缩景观造景"]),
  ...activityGroup("兴趣技能", "生活美学", "美", "门店预约 · 原料与成品确认", "4–8人 · 体验课", ["咖啡拉花体验", "烘焙蛋糕饼干", "调酒入门", "插花与多肉种植"]),

  ...activityGroup("社团社交", "文化体验", "文", "同好匹配 · 服装与拍摄协作", "6–20人 · 社团可承办", ["汉服出行日", "JK茶会", "Lolita茶会", "动漫Cosplay外拍"]),
  ...activityGroup("社团社交", "语言交流", "语", "语言水平匹配 · 话题卡辅助", "6–16人 · 固定复组", ["外语角", "方言趣味教学"]),
  ...activityGroup("社团社交", "生活观察", "校", "校内路线 · 轻社交任务设计", "6–20人 · 校园限定", ["校园猫猫图鉴拍摄", "深夜夜聊茶话会", "闲置物品交换市集"]),
  ...activityGroup("社团社交", "竞技观赛", "赛", "赛事排期 · 场地与座位预约", "6–30人 · 可组观赛局", ["电竞赛事集体观赛", "体育球赛集体观赛", "网吧多排开黑"]),

  ...activityGroup("学习充电", "思维碰撞", "思", "主题与观点匹配 · 主持流程生成", "6–20人 · 校园讨论", ["奇葩说式辩论赛", "TEDx观影会", "圆桌读书会"]),
  ...activityGroup("学习充电", "技能实战", "技", "目标诊断 · 模板与同伴反馈", "4–12人 · 可带作品", ["PPT设计工坊", "简历诊断所", "模拟面试官"]),
  ...activityGroup("学习充电", "实验室探秘", "研", "机构预约 · 名额与安全须知", "6–20人 · 校内资源", ["参观科研大棚", "天文台观星", "动植物标本制作"]),

  ...activityGroup("户外探索", "城市猎人", "城", "路线生成 · 兴趣点与节奏匹配", "6–12人 · 白天成团", ["Citywalk人文历史路线", "美食探店路线", "寻找城市地标打卡"]),
  ...activityGroup("户外探索", "自然野趣", "野", "装备清单 · 天气与安全提醒", "6–16人 · 真人领队", ["露营烧烤", "篝火晚会", "钓鱼捞虾", "油菜花田写生"]),
  ...activityGroup("户外探索", "极限挑战", "极", "资质商家 · 保险与风险确认", "4–10人 · 审核后开放", ["室内冲浪", "滑板刷街", "周边游蹦极或跳伞体验"]),
];

const plazaCategories = ["推荐", "运动", "轻娱乐", "兴趣技能", "社团社交", "学习充电", "户外探索"];

const preferenceOptions = ["篮球3V3","羽毛球双打","飞盘争夺赛","麻将三缺一","剧本杀","Switch派对游戏","城市街拍约拍","陶艺拉坯","乐队合奏","外语角","圆桌读书会","Citywalk人文历史路线"];

const urgentEvents = [
  {name:"麻将三缺一",current:3,total:4,time:"今天 19:30",place:"南门桌游店",urgency:"还差 1 人"},
  {name:"篮球3V3",current:5,total:6,time:"今天 20:00",place:"东区球场",urgency:"还差 1 人"},
  {name:"剧本杀",current:5,total:6,time:"周六 14:00",place:"校内合作门店",urgency:"缺 1 位推理玩家"},
  {name:"羽毛球双打",current:3,total:4,time:"周六 15:00",place:"东区体育馆",urgency:"最后 1 席"},
];

const quizQuestions = [
  {question:"一个空闲下午，你更想怎么度过？",answers:[
    {label:"动起来，最好有点竞技",scores:{运动:3,户外探索:1},tag:"行动派"},
    {label:"做点东西或记录生活",scores:{兴趣技能:3,学习充电:1},tag:"创作型"},
    {label:"和一群人玩点热闹的",scores:{轻娱乐:3,社团社交:2},tag:"组队型"},
  ]},
  {question:"面对陌生人组局，你更舒服的方式是？",answers:[
    {label:"先完成一个共同任务",scores:{运动:2,学习充电:2},tag:"目标感"},
    {label:"通过作品或兴趣慢慢熟悉",scores:{兴趣技能:3,社团社交:1},tag:"慢热"},
    {label:"直接玩起来，气氛最重要",scores:{轻娱乐:3,社团社交:2},tag:"热闹"},
  ]},
  {question:"你更期待活动给你什么？",answers:[
    {label:"肾上腺素和新鲜感",scores:{户外探索:3,运动:2},tag:"探索欲"},
    {label:"掌握一个可见的新技能",scores:{兴趣技能:3,学习充电:2},tag:"创作型"},
    {label:"认识同频的人",scores:{社团社交:3,轻娱乐:2},tag:"同好型"},
  ]},
  {question:"临时组队时，你通常扮演？",answers:[
    {label:"带节奏、做决定的人",scores:{运动:2,户外探索:2},tag:"行动派"},
    {label:"观察局面、补充想法的人",scores:{学习充电:2,兴趣技能:2},tag:"表达型"},
    {label:"让大家都舒服的人",scores:{社团社交:3,轻娱乐:1},tag:"轻社交"},
  ]},
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
  const [category, setCategory] = useState("推荐");
  const [partner, setPartner] = useState("学生社团");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [preferenceDraft, setPreferenceDraft] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [recommendationSeed, setRecommendationSeed] = useState(1);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [toast, setToast] = useState("");
  const progress = useMemo(() => (step / 4) * 100, [step]);

  const quizReport = useMemo(() => {
    const scores: Record<string, number> = {};
    const tags: string[] = [];
    quizAnswers.forEach((answerIndex, questionIndex) => {
      const answer = quizQuestions[questionIndex]?.answers[answerIndex];
      if (!answer) return;
      Object.entries(answer.scores).forEach(([name,value])=>{scores[name]=(scores[name]||0)+value;});
      if (!tags.includes(answer.tag)) tags.push(answer.tag);
    });
    const categories = Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([name])=>name);
    return {categories,tags,type:tags.slice(0,2).join(" · ")||"兴趣探索者"};
  }, [quizAnswers]);

  const preferenceCategories = useMemo(() => preferences.map(name=>activities.find(item=>item.name===name)?.category).filter(Boolean) as string[], [preferences]);
  const recommendations = useMemo(() => activities.map(item=>{
    const exact = preferences.includes(item.name) ? 70 : 0;
    const related = preferenceCategories.includes(item.category) ? 28 : 0;
    const quizFit = quizReport.categories.slice(0,2).includes(item.category) ? 22 : 0;
    const hash = [...`${item.name}${recommendationSeed}`].reduce((sum,char)=>sum+char.charCodeAt(0),0)%17;
    return {item,score:exact+related+quizFit+(item.featured?10:0)+hash};
  }).sort((a,b)=>b.score-a.score).slice(0,4).map(result=>result.item), [preferences,preferenceCategories,quizReport.categories,recommendationSeed]);

  const currentActivity = activities.find(item=>item.name===activity) || activities[0];
  const matchPlan = useMemo(() => matchUsers({
    activity,
    category:currentActivity.category,
    time,
    level,
    seats,
    campus:"杭州大学城",
    personalityTags:quizReport.tags,
  }), [activity,currentActivity.category,time,level,seats,quizReport.tags]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const openMatch = (name?: string) => {
    if (name) setActivity(name);
    setStep(1);
    setView("match");
  };

  const finishPreferences = () => {
    setPreferences(preferenceDraft);
    setCategory("推荐");
    setShowOnboarding(false);
  };

  const answerQuiz = (answerIndex: number) => {
    const next = [...quizAnswers];
    next[quizStep] = answerIndex;
    setQuizAnswers(next);
    if (quizStep < quizQuestions.length - 1) setQuizStep(quizStep + 1);
    else setQuizStep(quizQuestions.length);
  };

  const autoMatchFromQuiz = () => {
    const bestCategory = quizReport.categories[0] || "轻娱乐";
    const suggested = activities.find(item=>item.category===bestCategory && item.featured) || activities.find(item=>item.category===bestCategory) || activities[0];
    setPreferences(previous=>Array.from(new Set([...previous,suggested.name])));
    setActivity(suggested.name);
    setStep(3);
    setView("match");
  };

  const navItems: Array<[View, string, string]> = [
    ["home", "⌂", "首页"], ["match", "✦", "开始匹配"],
    ["plaza", "◫", "活动广场"], ["quiz", "◇", "兴趣测试"], ["partners", "♧", "组织"],
  ];

  return <main>
    <header className="nav app-nav">
      <button className="brand" onClick={()=>setView("home")}><span className="brand-mark">碰</span><span>碰个面</span><em>AI 主理人</em></button>
      <nav aria-label="主导航">
        <button onClick={()=>setView("plaza")}>活动广场</button>
        <button className="nav-match" onClick={()=>openMatch()}>开始匹配</button>
        <button onClick={()=>setView("quiz")}>兴趣测试</button>
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

          {view === "home" && <div className="workspace-view home-view live-home">
            <div className="live-heading"><div><span>LIVE CAMPUS SIGNALS</span><h1>现在，谁正缺你一个？</h1><p>按真实席位缺口优先展示；点击即可进入匹配与补位流程。</p></div><button onClick={()=>setView("plaza")}>查看全部活动 →</button></div>
            <div className="urgent-grid">{urgentEvents.map((event,index)=><button className={`urgent-card ${index===0?"hot":""}`} key={event.name} onClick={()=>openMatch(event.name)}><div className="urgent-top"><span>{index===0?"急":"缺"}</span><em>{event.urgency}</em></div><h2>{event.name}</h2><p>{event.time} · {event.place}</p><div className="seat-line"><i style={{width:`${event.current/event.total*100}%`}}/><b>{event.current}/{event.total}</b></div><small>立即补位 →</small></button>)}</div>
            <div className="home-recommend-head"><div><span>FOR YOU</span><h2>{preferences.length?"根据你的偏好，为你挑了 4 个":"先看看本校最容易成局的 4 个"}</h2></div><div><button onClick={()=>setRecommendationSeed(seed=>seed+1)}>换一组</button><button onClick={()=>setView("quiz")}>不知道喜欢什么？做测试 →</button></div></div>
            <div className="home-recommend-grid">{recommendations.map((item,index)=><button key={item.name} onClick={()=>openMatch(item.name)}><span className={`activity-icon c${index}`}>{item.icon}</span><div><em>{item.category}</em><h3>{item.name}</h3><p>{item.note}</p></div><i>匹配 →</i></button>)}</div>
          </div>}

          {view === "match" && <div className="workspace-view embedded-view match-view">
            <div className="view-heading"><div><span>LIVE PRODUCT DEMO</span><h2>完成一次“AI 成局”</h2><p>当前内容区直接切换，外层工作台不会跳转。</p></div><b>{step}/4<small>当前进度</small></b></div>
            <div className="progress"><i style={{width:`${progress}%`}} /></div>
            <div className="demo-shell">
              <aside>{[[1,"告诉AI"],[2,"确认偏好"],[3,"匹配结果"],[4,"成局成功"]].map(([n,label])=><button key={n} className={step===n?"active":step>n?"done":""} onClick={()=>setStep(n as Step)}><span>{step>n?"✓":n}</span>{label}</button>)}<div className="agent-info"><span className="ai-avatar">碰</span><div><b>AI主理人正在工作</b><p>已为你节省约 42 分钟沟通</p></div></div></aside>
              <div className="demo-content">
                {step===1&&<div className="panel enter-panel"><span className="panel-tag">STEP 01</span><h3>你想和同学一起做什么？</h3><p>不用填写复杂表单，一句话就够了。</p><div className="idea-input"><span>✦</span><textarea value={`这周六下午想${activityCopy[activity]||`参加${activity}`}，希望规则和费用提前说清楚。`} readOnly/><button onClick={()=>setStep(2)}>交给 AI 安排 →</button></div><div className="ideas"><span>换个想法：</span>{["摄影入门","一起看电影","桌游组局","台球新手局"].map(x=><button className={activity===x?"selected":""} key={x} onClick={()=>setActivity(x)}>{x}</button>)}</div></div>}
                {step===2&&<div className="panel preference-panel"><span className="panel-tag">STEP 02</span><h3>我理解得对吗？</h3><p>确认真正影响成局的硬条件。</p><div className="form-grid"><label>活动主题<select value={activity} onChange={e=>setActivity(e.target.value)}>{activities.map(x=><option key={x.name}>{x.name}</option>)}</select></label><label>时间<select value={time} onChange={e=>setTime(e.target.value)}><option>周六 15:00</option><option>周六 19:00</option><option>周日 10:00</option></select></label><label>水平 / 目标<select value={level} onChange={e=>setLevel(e.target.value)}><option>新手友好</option><option>同水平参与</option><option>固定互相监督</option></select></label><label>理想人数<div className="stepper"><button onClick={()=>setSeats(Math.max(4,seats-1))}>−</button><b>{seats} 人</b><button onClick={()=>setSeats(Math.min(10,seats+1))}>＋</button></div></label></div><div className="question"><b>把活动规则先说清楚</b><p>选择最重要的一条约定</p><div>{["提前4小时可取消","各自AA，不代付","不强社交，按时结束"].map(x=><button key={x} className={answer===x?"selected":""} onClick={()=>setAnswer(x)}>{x}</button>)}</div></div><button className="wide-button" onClick={()=>setStep(3)}>开始智能匹配 <span>预计 8 秒</span></button></div>}
                {step===3&&<div className="panel result-panel"><div className="match-proof"><span className="panel-tag success">匹配算法已运行 · 同校成员已核验</span><b>平均匹配度 {matchPlan.averageScore}</b></div><div className="result-title"><div><h3>{level}{activity}局</h3><p>{time} · 校内合作场地 · {seats}人小组</p></div><span className="price">¥18<small>/席</small></span></div><div className="match-factors">{matchPlan.factors.map(factor=><span key={factor}>✓ {factor}</span>)}</div><div className="people-grid">{matchPlan.selected.map((person,i)=><div className="person" key={person.id}><span className={`portrait p${i%5}`}>{person.avatar}</span><div><b>{person.name}</b><p>{person.level} · {person.reasons.slice(0,2).join(" / ")}</p></div><em>{person.score} 分</em></div>)}</div><div className="backup-line"><b>自动候补</b><span>{matchPlan.backups.map(person=>person.name).join("、")}</span><em>爽约时按得分顺序补位</em></div><div className="captain"><span>队</span><div><b>真人队长：阿野</b><p>已带队 23 场 · 评分 4.9</p></div><em>身份已认证</em></div><div className="included"><b>席位包含</b><span>✓ 场地</span><span>✓ 水平分组</span><span>✓ AI提醒及候补</span></div><button className="wide-button pay" onClick={()=>setStep(4)}>确认并购买席位 · ¥18 <span>模拟支付 →</span></button><p className="fine-print">当前 Demo 使用模拟用户池运行真实评分逻辑，不会产生真实扣款</p></div>}
                {step===4&&<div className="panel done-panel"><div className="checkmark">✓</div><span className="panel-tag success">已成功占座</span><h3>这一局，交给我们。</h3><p>AI主理人会处理确认、补位与提醒。</p><div className="ticket"><div className="ticket-main"><span className="sport-icon">碰</span><div><b>{level}{activity}局</b><p>{time} · 校内合作场地</p></div><strong>{seats}/{seats}<br/><small>已成局</small></strong></div><div className="ticket-code"><div className="fake-qr">▦</div><div><b>签到码 2861</b><p>活动前30分钟开放</p></div><button onClick={()=>notify("活动已加入日历")}>加入日历</button></div></div><div className="next-actions"><button onClick={()=>notify("邀请链接已复制")}>邀请同学</button><button onClick={()=>openMatch()}>再开一局</button></div></div>}
              </div>
            </div>
          </div>}

          {view === "plaza" && <div className="workspace-view embedded-view plaza-view">
            <div className="view-heading plaza-heading"><div><span>CAMPUS ACTIVITY PLAZA</span><h2>大学生娱乐活动广场</h2><p>{activities.length} 种活动灵感，AI 帮你匹同好、凑人数、订场地并处理候补。</p></div><b>{category === "推荐" ? 4 : activities.filter(x=>x.category===category).length}<small>{category === "推荐" ? "个性化推荐" : `${category}活动`}</small></b></div>
            <div className="category-tabs">{plazaCategories.map(x=><button key={x} className={category===x?"active":""} onClick={()=>setCategory(x)}>{x}<small>{x === "推荐" ? 4 : activities.filter(item=>item.category===x).length}</small></button>)}</div>
            {category === "推荐" ? <><div className="recommend-toolbar"><span>根据你的偏好与测试结果生成，每次展示 4 个</span><div><button onClick={()=>{setPreferenceDraft(preferences);setShowOnboarding(true)}}>调整偏好</button><button onClick={()=>setRecommendationSeed(seed=>seed+1)}>换一组</button></div></div><div className="activity-grid recommendation-grid">{recommendations.map((item,i)=><button className="activity-card" key={item.name} onClick={()=>openMatch(item.name)}><span className={`activity-icon c${i%5}`}>{item.icon}</span><div><em>{item.category}</em><h3>{item.name}</h3><p>{item.note}</p><b>{item.meta}</b></div><i>交给 AI 成局 →</i></button>)}</div></> : <><div className="plaza-summary"><div><span className="summary-spark">✦</span><div><b>{category} · {activities.filter(x=>x.category===category).length} 个可发起玩法</b><p>点选任意活动，直接进入 AI 成局流程；人数、水平、时间和费用都可以继续确认。</p></div></div><button onClick={()=>openMatch()}>直接告诉 AI →</button></div><div className="activity-groups">{Array.from(new Set(activities.filter(x=>x.category===category).map(x=>x.group))).map(group=><section className="activity-section" key={group}><div className="activity-section-title"><h3>{group}</h3><span>{activities.filter(x=>x.category===category&&x.group===group).length} 个玩法</span></div><div className="activity-grid">{activities.filter(x=>x.category===category&&x.group===group).map((x,i)=><button className="activity-card" key={x.name} onClick={()=>openMatch(x.name)}><span className={`activity-icon c${i%5}`}>{x.icon}</span><div><em>{x.category} · {x.group}</em><h3>{x.name}</h3><p>{x.note}</p><b>{x.meta}</b></div><i>交给 AI 成局 →</i></button>)}</div></section>)}</div></>}
          </div>}

          {view === "quiz" && <div className="workspace-view embedded-view quiz-view"><div className="view-heading"><div><span>ACTIVITY PERSONALITY LAB</span><h2>你适合怎样的校园活动？</h2><p>4 个问题推断你的活动偏好，并直接进入匹配。</p></div><b>{Math.min(quizStep+1,quizQuestions.length)}/{quizQuestions.length}<small>{quizStep<quizQuestions.length?"测试进度":"报告已生成"}</small></b></div>{quizStep < quizQuestions.length ? <div className="quiz-shell"><div className="quiz-progress"><i style={{width:`${(quizStep+1)/quizQuestions.length*100}%`}}/></div><span>QUESTION {String(quizStep+1).padStart(2,"0")}</span><h3>{quizQuestions[quizStep].question}</h3><div className="quiz-answers">{quizQuestions[quizStep].answers.map((answer,index)=><button key={answer.label} onClick={()=>answerQuiz(index)}><i>{String.fromCharCode(65+index)}</i><span>{answer.label}</span><em>→</em></button>)}</div>{quizStep>0&&<button className="quiz-back" onClick={()=>setQuizStep(quizStep-1)}>← 上一题</button>}</div> : <div className="quiz-report"><div className="report-orb">{quizReport.tags[0]?.slice(0,1)||"趣"}</div><span>YOUR ACTIVITY TYPE</span><h3>{quizReport.type}</h3><p>你更容易在“有共同目标、又不过度尬聊”的活动中获得能量。</p><div className="report-categories">{quizReport.categories.slice(0,3).map((name,index)=><div key={name}><b>0{index+1}</b><span>{name}</span><i style={{width:`${92-index*14}%`}}/></div>)}</div><div className="report-picks">{activities.filter(item=>quizReport.categories.slice(0,2).includes(item.category)).slice(0,3).map(item=><button key={item.name} onClick={()=>openMatch(item.name)}>{item.icon} {item.name}</button>)}</div><button className="report-match" onClick={autoMatchFromQuiz}>根据报告自动匹配并成局 →</button><button className="report-retry" onClick={()=>{setQuizAnswers([]);setQuizStep(0)}}>重新测试</button></div>}</div>}

          {view === "partners" && <div className="workspace-view embedded-view partner-view"><div className="view-heading"><div><span>CAMPUS PARTNER NETWORK</span><h2>机构接入</h2><p>社团、校园墙和场地商家接入同一个活动网络。</p></div></div><div className="partner-shell"><div className="partner-tabs">{["学生社团","校园墙","场地商家"].map(x=><button className={partner===x?"active":""} key={x} onClick={()=>setPartner(x)}>{x}</button>)}</div><div className="partner-content"><div className="partner-copy"><span className="partner-type">{partner}接入空间</span><h3>{partner==="学生社团"?"把一次招新，变成持续活动供给":partner==="校园墙"?"从发布信息，升级为可报名的校园频道":"把空闲场地，变成稳定的学生订单"}</h3><p>{partner==="学生社团"?"乐器社、舞蹈社、摄影社等获得认证主页；AI处理报名、收费、候补、签到和复盘。":partner==="校园墙"?"帖子可一键转为结构化活动卡，按学校分发并追踪报名与到场。":"台球厅、桌游店、影院和球馆可发布校园时段，自动拼场。"}</p><div className="partner-benefits"><span>✓ 认证主页</span><span>✓ 一键分发</span><span>✓ 候补签到</span><span>✓ 收益结算</span></div><button onClick={()=>notify(`${partner}接入申请 Demo 已提交`)}>申请接入 →</button></div><div className="org-preview"><div className="org-head"><span>{partner==="学生社团"?"乐":partner==="校园墙"?"墙":"店"}</span><div><b>{partner==="学生社团"?"杭城大学吉他社":partner==="校园墙"?"杭城大学校园墙":"南门青年台球俱乐部"}</b><p>负责人已认证 · 本校可见</p></div><em>已接入</em></div><div className="org-stats"><div><b>1,286</b><span>关注学生</span></div><div><b>32</b><span>已完成活动</span></div><div><b>91%</b><span>平均到场率</span></div></div><div className="org-event"><span>本周活动</span><b>{partner==="学生社团"?"零基础吉他合奏体验":partner==="校园墙"?"周五校园露天电影夜":"台球新手四人练习局"}</b><p>AI已完成场地、规则和报名配置</p><button onClick={()=>notify("已加入活动候补名单")}>查看并报名</button></div></div></div></div></div>}

          {view === "business" && <div className="workspace-view embedded-view business-view"><div className="view-heading"><div><span>FOR BRAND & VENUE</span><h2>品牌合作</h2><p>按真实到场、商品体验与成交结果获得校园增长。</p></div></div><div className="business-dashboard"><div><h3>每次成局，都是一次真实消费。</h3><p>席位、场地、物资与天猫商品在同一订单链路中完成。</p><div className="stats"><div><b>同校</b><span>身份已核验</span></div><div><b>守约率</b><span>活动后沉淀</span></div><div><b>全链路</b><span>报名至核销</span></div></div><button onClick={()=>notify("合作方案：按到场、核销或成交结算")}>查看合作方案 →</button></div><div className="funnel-card"><div className="funnel-head"><div><span className="brand-dot">N</span><div><b>运动品牌校园体验局</b><p>演示数据 · 杭州 · 5所高校</p></div></div><em>模拟看板</em></div><div className="metric-row"><div><span>活动场次</span><b>24</b></div><div><span>真实到场</span><b>386</b></div><div><span>天猫成交</span><b>¥28.6k</b></div></div><div className="bars"><span style={{height:"48%"}}/><span style={{height:"68%"}}/><span style={{height:"60%"}}/><span style={{height:"87%"}}/><span style={{height:"72%"}}/><span style={{height:"94%"}}/></div></div></div></div>}

        </div>
      </div>
    </section>
    {showOnboarding&&<div className="onboarding-layer" role="dialog" aria-modal="true" aria-label="选择活动偏好"><div className="onboarding-card"><span className="onboarding-mark">碰</span><em>WELCOME TO 碰个面</em><h2>平常你对什么感兴趣？</h2><p>选 3 个左右就好。推荐只会优先参考，不会把你困在标签里。</p><div className="preference-grid">{preferenceOptions.map(name=><button key={name} className={preferenceDraft.includes(name)?"selected":""} onClick={()=>setPreferenceDraft(list=>list.includes(name)?list.filter(item=>item!==name):[...list,name])}><span>{activities.find(item=>item.name===name)?.icon}</span>{name}<i>{preferenceDraft.includes(name)?"✓":"＋"}</i></button>)}</div><div className="onboarding-actions"><button className="discover-personality" onClick={()=>{setShowOnboarding(false);setView("quiz")}}>还不知道，先做性格测试</button><button className="save-preferences" onClick={finishPreferences}>{preferenceDraft.length?`用这 ${preferenceDraft.length} 个生成推荐 →`:"先随便逛逛 →"}</button></div></div></div>}
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>;
}
