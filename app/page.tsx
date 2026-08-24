/* eslint-disable jsx-a11y/no-autofocus, jsx-a11y/label-has-associated-control */
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { matchUsers } from "../lib/matching";
import type { ScoredCandidate } from "../lib/matching";
import { rankActivitiesForProfile, searchActivities } from "../lib/discovery";
import { campusLocations, Coordinate, recommendVenues } from "../lib/location";
import { downloadIcs } from "../lib/calendar";
import { friendDirectory, searchFriends } from "../lib/friends";
import { parseFriendPayload } from "../lib/friend-code";
import type { MbtiResult } from "../lib/mbti";
import MbtiTest from "../components/MbtiTest";
import ProfileCenter, { ProfileDestination } from "../components/ProfileCenter";
import FriendCodePanel from "../components/FriendCodePanel";
import AccountCenter from "../components/AccountCenter";
import InvitationMatch from "../components/InvitationMatch";
import ActivityRoom from "../components/ActivityRoom";
import PostActivity from "../components/PostActivity";
import SafetyControls, { AudienceRules } from "../components/SafetyControls";
import AmapVenueMap from "../components/AmapVenueMap";

type Step = 1 | 2 | 3 | 4;
type View = "home" | "match" | "plaza" | "quiz" | "friends" | "history" | "partners" | "business" | "profile" | "friendCode" | "security" | "verification" | "tags" | "review";
type Scene = "offline" | "online" | "study";

type Activity = {
  name: string;
  category: string;
  group: string;
  icon: string;
  note: string;
  meta: string;
  featured: boolean;
  scene?: Scene;
  aliases?: string[];
};

const scenes: Record<Scene, {title:string; eyebrow:string; description:string; icon:string; action:string; detail:string}> = {
  offline: {title:"线下娱乐",eyebrow:"OFFLINE PLAY",description:"找同校同好，确认场地、费用和到场规则。",icon:"◎",action:"去找线下活动",detail:"同校匹配 · 就近选场 · 到场签到"},
  online: {title:"线上快速组队",eyebrow:"ONLINE SQUAD",description:"游戏速配、实时补位；双方确认后再交换游戏 ID 和房间码。",icon:"⌁",action:"去组队开黑",detail:"即时补位 · 建房组队 · ID 受控交换"},
  study: {title:"学习与竞赛搭子",eyebrow:"STUDY & COMPETE",description:"为证书、竞赛和长期共学，匹配目标相同、节奏合拍的同伴。",icon:"◇",action:"去找学习搭子",detail:"目标匹配 · 周期共学 · 竞赛角色互补"},
};

const studyRoleOptions: Record<string, string[]> = {
  "数学建模竞赛组队":["Python 编程","建模求解","论文写作","数据分析"],
  "商业案例大赛组队":["行业研究","数据分析","产品设计","路演表达"],
  "挑战杯项目匹配":["产品设计","项目运营","数据分析","路演表达"],
  "CPA 财管晚间共学":["CPA 财管","打卡监督"],
  "ACM 算法刷题小组":["Python 编程","建模求解"],
  "考研监督自习组":["打卡监督","论文写作"],
};

const studyProofOptions = [
  {id:"portfolio",label:"上传课程作业 / 作品集",note:"用于核验实际完成能力"},
  {id:"credential",label:"提供成绩、证书或参赛证明",note:"仅向本局审核规则验证"},
  {id:"assessment",label:"完成岗位微测验",note:"8 分钟情境题，不以绝对分数公开排名"},
];

type HistoryRecord = {
  id:string;
  activity:string;
  time:string;
  venue:string;
  price:number;
  createdAt:string;
  status:"已成局"|"已完成";
  calendarAdded?:boolean;
};

const defaultActivityTime = "2026-08-22T15:00";

const formatActivityTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const featuredActivities = new Set([
  "羽毛球双打", "飞盘争夺赛", "校园夜跑打卡", "攀岩抱石",
  "密室逃脱", "Switch派对游戏", "台球斯诺克", "城市街拍约拍",
  "乐队合奏", "陶艺拉坯", "外语角", "圆桌读书会",
  "天文台观星", "Citywalk人文历史路线", "露营烧烤", "赛博跳动",
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
  ...activityGroup("轻娱乐", "新奇体验", "趣", "场地预约 · 费用提前确认", "2–8人 · 可拼场", ["VR虚拟对战", "射箭", "飞镖", "保龄球", "台球斯诺克", "赛博跳动"]),

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

const onlineActivities: Activity[] = [
  {name:"王者荣耀五排速配",category:"MOBA 开黑",group:"手游即时组队",icon:"王",note:"按段位、位置与开麦偏好匹配 · 双向确认后交换游戏 ID",meta:"2–5人 · 即刻建房",featured:true,scene:"online",aliases:["王者","王者荣耀","五排","开黑","排位"]},
  {name:"无畏契约排位组队",category:"射击组队",group:"端游即时组队",icon:"瓦",note:"按段位、地图池和沟通风格匹配 · 房间码仅对确认成员可见",meta:"2–5人 · 即刻开局",featured:true,scene:"online",aliases:["无畏契约","瓦","valorant","排位","开黑"]},
  {name:"英雄联盟峡谷组队",category:"MOBA 开黑",group:"端游即时组队",icon:"盟",note:"位置互补、段位相近 · 先确认再拉进语音与游戏房间",meta:"2–5人 · 即时补位",featured:false,scene:"online",aliases:["英雄联盟","LOL","峡谷","lol","开黑"]},
  {name:"蛋仔派对欢乐局",category:"轻量游戏",group:"手游即时组队",icon:"蛋",note:"休闲模式优先，快速凑队；可选不开麦或仅文字沟通",meta:"2–4人 · 新手友好",featured:false,scene:"online",aliases:["蛋仔","蛋仔派对","休闲游戏","手游"]},
  {name:"Switch 联机派对",category:"轻量游戏",group:"主机与联机",icon:"游",note:"确认联机游戏与时间，AI 生成临时语音房和组队清单",meta:"2–8人 · 线上联机",featured:false,scene:"online",aliases:["switch","任天堂","联机","派对游戏"]},
  {name:"原神联机探索",category:"协作冒险",group:"手游即时组队",icon:"原",note:"按世界等级和任务目标互补，避免无目的加好友",meta:"2–4人 · 目标明确",featured:false,scene:"online",aliases:["原神","联机","探索","副本"]},
];

const studyActivities: Activity[] = [
  {name:"CPA 财管晚间共学",category:"证书共学",group:"商科证书",icon:"CPA",note:"按备考科目、每日时段和打卡节奏匹配 · 共同完成周计划",meta:"3–6人 · 固定复组",featured:true,scene:"study",aliases:["CPA","财管","注册会计师","商科","证书"]},
  {name:"数学建模竞赛组队",category:"竞赛组队",group:"学科竞赛",icon:"建",note:"按建模、编程、论文三个角色互补，先看能力卡再相互确认",meta:"3人队 · 可长期协作",featured:true,scene:"study",aliases:["数学建模","建模","国赛","竞赛","MCM"]},
  {name:"商业案例大赛组队",category:"竞赛组队",group:"商科竞赛",icon:"商",note:"按行业研究、数据分析、路演表达互补，生成分工与里程碑",meta:"3–5人 · 项目制",featured:true,scene:"study",aliases:["商业案例","案例大赛","商赛","case","咨询"]},
  {name:"挑战杯项目匹配",category:"竞赛组队",group:"创新创业",icon:"创",note:"按课题方向、技术和运营角色筛选候选人，先双向确认再组队",meta:"3–6人 · 项目制",featured:false,scene:"study",aliases:["挑战杯","创新创业","项目","创业比赛"]},
  {name:"ACM 算法刷题小组",category:"技能共学",group:"技术成长",icon:"码",note:"按语言基础与训练频率匹配，支持每日题单、周末复盘",meta:"2–6人 · 线上为主",featured:false,scene:"study",aliases:["ACM","算法","刷题","编程","leetcode"]},
  {name:"考研监督自习组",category:"长期共学",group:"考试备考",icon:"研",note:"按专业方向、图书馆时段和监督方式匹配，建立每日打卡",meta:"2–6人 · 周期复组",featured:false,scene:"study",aliases:["考研","自习","监督","学习搭子","打卡"]},
];

const plazaCategories = ["推荐", "运动", "轻娱乐", "兴趣技能", "社团社交", "学习充电", "户外探索"];
const sceneCategories: Record<Scene, string[]> = {
  offline: plazaCategories,
  online: ["推荐", "MOBA 开黑", "射击组队", "轻量游戏", "协作冒险"],
  study: ["推荐", "证书共学", "竞赛组队", "技能共学", "长期共学"],
};

const preferenceOptions = ["篮球3V3","羽毛球双打","飞盘争夺赛","麻将三缺一","剧本杀","Switch派对游戏","城市街拍约拍","陶艺拉坯","乐队合奏","外语角","圆桌读书会","Citywalk人文历史路线"];

const defaultPersonalTags = ["神秘树洞","王者荣耀","健身达人","咖啡脑袋","INTP","数码发烧友","网络梗王"];
const personalTagGroups = [
  ["神秘树洞","完美主义","选择困难症","拖延症晚期","快乐小狗","动漫迷","二次元","社恐","废话输出机","小哭包","e人","i人","有腹肌","颜狗","重度声控","学霸","旅游达人","吃货","理科生","反差er","夜猫子","大学生","体育生","男高","慢热型","自来熟","纯爱战士","哈哈都会","情绪稳定","外冷内憨","超会玩","佛系","玄学","emo人","人间清醒"],
  ["steam","王者荣耀","密室逃脱","剧本杀","switch","PS5","电竞少女","吃鸡达人","三角洲","瓦学弟","金铲铲","第五人格","打瓦打瓦","游戏搭子","资深影迷","数码发烧友","网络梗王","赛博朋克","数字游民","web3.0"],
  ["健身达人","咖啡脑袋","P图大师","dancer","vlog生活家","K歌之王","美食活地图","扩列狂魔","灵魂画手","深夜情感电台","吹拉弹唱","猫狗双全","哈基米","考研ing","已婚人士","手艺人","追星族","旅行家","语言艺术家"],
  ["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"],
  ["商赛","商业案例","挑战杯","创新创业","CPA","金融","咨询","行业研究","路演","财务分析","论文写作","数学建模","ACM","算法","编程"],
];

const urgentEvents: Array<{name:string;current:number;total:number;time:string;place:string;urgency:string;scene:Scene}> = [
  {name:"麻将三缺一",current:3,total:4,time:"今天 19:30",place:"南门桌游店",urgency:"还差 1 人",scene:"offline"},
  {name:"王者荣耀五排速配",current:3,total:5,time:"今晚 20:30",place:"线上房间",urgency:"缺 2 个位置",scene:"online"},
  {name:"CPA 财管晚间共学",current:4,total:6,time:"今晚 19:00",place:"线上自习室",urgency:"还差 2 人",scene:"study"},
  {name:"数学建模竞赛组队",current:2,total:3,time:"本周招募",place:"线上协作",urgency:"缺 1 位编程同学",scene:"study"},
];

const liveSignals: Array<{icon:string;label:string;title:string;detail:string;tone:string;scene:Scene;activity?:string}> = [
  {icon:"⌖",label:"距你约1.2km",title:"麻将三缺一",detail:"19:30截止 · 还差1人",tone:"hot",scene:"offline",activity:"麻将三缺一"},
  {icon:"⌁",label:"线上实时补位",title:"无畏契约排位组队",detail:"还差2人 · 已开语音房",tone:"campus",scene:"online",activity:"无畏契约排位组队"},
  {icon:"研",label:"同校共学招募",title:"CPA 财管晚间共学",detail:"还差2人 · 今晚19:00",tone:"friend",scene:"study",activity:"CPA 财管晚间共学"},
  {icon:"今",label:"你附近今天",title:"8场线下活动正在确认",detail:"均只显示模糊距离",tone:"nearby",scene:"offline"},
  {icon:"✓",label:"刚刚完成",title:"3人商赛小组",detail:"已建立下周任务清单",tone:"done",scene:"study",activity:"商业案例大赛组队"},
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

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [step, setStep] = useState<Step>(1);
  const [activity, setActivity] = useState("羽毛球双打");
  const [time, setTime] = useState(defaultActivityTime);
  const [level, setLevel] = useState("新手友好");
  const [seats, setSeats] = useState(6);
  const [answer, setAnswer] = useState("提前4小时可取消");
  const [category, setCategory] = useState("推荐");
  const [scene, setScene] = useState<Scene>("offline");
  const [studyRole, setStudyRole] = useState("Python 编程");
  const [studyProofs, setStudyProofs] = useState<string[]>(["portfolio", "assessment"]);
  const [weeklyHours, setWeeklyHours] = useState(8);
  const [partner, setPartner] = useState("学生社团");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [preferenceDraft, setPreferenceDraft] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [recommendationSeed, setRecommendationSeed] = useState(1);
  const [personalTags, setPersonalTags] = useState<string[]>(defaultPersonalTags);
  const [tagDraft, setTagDraft] = useState<string[]>(defaultPersonalTags);
  const [selectedDiscoveryActivity, setSelectedDiscoveryActivity] = useState("羽毛球双打");
  const [homeBatch, setHomeBatch] = useState(0);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [testMode, setTestMode] = useState<"hub"|"activity"|"mbti">("hub");
  const [mbtiResult, setMbtiResult] = useState<MbtiResult|null>(null);
  const [verificationStatus, setVerificationStatus] = useState<"unverified"|"reviewing"|"verified">("unverified");
  const [scannedFriendId, setScannedFriendId] = useState("");
  const [toast, setToast] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [customActivities, setCustomActivities] = useState<Activity[]>([]);
  const [showCustomActivity, setShowCustomActivity] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("轻娱乐");
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinate>(campusLocations[0]);
  const [locationState, setLocationState] = useState<"ready"|"locating"|"denied">("ready");
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [venueFeeIncluded, setVenueFeeIncluded] = useState(true);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [outgoingFriendIds, setOutgoingFriendIds] = useState<string[]>([]);
  const [incomingFriendIds, setIncomingFriendIds] = useState<string[]>(["PG52020"]);
  const [audienceRules, setAudienceRules] = useState<AudienceRules>({sameCampus:true,womenOnly:false,friendsOnly:false,hideContacts:true});
  const [roomParticipants, setRoomParticipants] = useState<ScoredCandidate[]>([]);
  const progress = useMemo(() => (step / 4) * 100, [step]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setHistory(JSON.parse(localStorage.getItem("penggemian-history") || "[]"));
        setCustomActivities(JSON.parse(localStorage.getItem("penggemian-custom-activities") || "[]"));
        setFriendIds(JSON.parse(localStorage.getItem("penggemian-friends") || "[]"));
        setOutgoingFriendIds(JSON.parse(localStorage.getItem("penggemian-friend-outgoing") || "[]"));
        setIncomingFriendIds(JSON.parse(localStorage.getItem("penggemian-friend-incoming") || '["PG52020"]'));
        setMbtiResult(JSON.parse(localStorage.getItem("penggemian-mbti") || "null"));
        const savedTags = JSON.parse(localStorage.getItem("penggemian-personal-tags") || "null");
        if (Array.isArray(savedTags) && savedTags.length) { setPersonalTags(savedTags); setTagDraft(savedTags); }
        const verification = JSON.parse(localStorage.getItem("penggemian-verification") || "null");
        if (["unverified","reviewing","verified"].includes(verification?.status)) setVerificationStatus(verification.status);
        const savedLocation = JSON.parse(localStorage.getItem("penggemian-location") || "null");
        if (savedLocation?.lat && savedLocation?.lng) setUserLocation(savedLocation);
        const currentUrl = new URL(window.location.href);
        const friend = currentUrl.searchParams.get("friend");
        const code = currentUrl.searchParams.get("fc");
        if (friend && code) {
          const parsed = parseFriendPayload(`${window.location.origin}/?friend=${encodeURIComponent(friend)}&fc=${encodeURIComponent(code)}`);
          if (parsed?.userId) {
            setScannedFriendId(parsed.userId);
            setFriendQuery(parsed.userId);
            setView("friends");
          }
        }
      } catch { /* damaged local demo data falls back to defaults */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const allActivities = useMemo(() => [...customActivities, ...activities, ...onlineActivities, ...studyActivities], [customActivities]);
  const sceneActivityList = useMemo(() => allActivities.filter(item => (item.scene || "offline") === scene), [allActivities, scene]);
  const activeScene = (allActivities.find(item=>item.name===activity)?.scene || scene) as Scene;
  const currentScene = scenes[activeScene];
  const searchResults = useMemo(() => searchActivities(searchQuery, sceneActivityList, personalTags), [searchQuery, sceneActivityList, personalTags]);
  const friendResults = useMemo(() => searchFriends(friendQuery), [friendQuery]);
  const friends = useMemo(() => friendDirectory.filter(profile => friendIds.includes(profile.id)), [friendIds]);
  const incomingFriends = useMemo(() => friendDirectory.filter(profile => incomingFriendIds.includes(profile.id)), [incomingFriendIds]);

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

  const preferenceCategories = useMemo(() => preferences.map(name=>allActivities.find(item=>item.name===name)?.category).filter(Boolean) as string[], [preferences,allActivities]);
  const mbtiCategories = useMemo(() => {
    const tags = mbtiResult?.tags || [];
    const result = new Set<string>();
    if (tags.some(tag=>["行动派","组队型","热闹"].includes(tag))) { result.add("运动"); result.add("轻娱乐"); }
    if (tags.some(tag=>["创作型","慢热"].includes(tag))) result.add("兴趣技能");
    if (tags.some(tag=>["同好型","表达型","轻社交"].includes(tag))) result.add("社团社交");
    if (tags.some(tag=>["目标感"].includes(tag))) result.add("学习充电");
    if (tags.some(tag=>["探索欲"].includes(tag))) result.add("户外探索");
    return Array.from(result);
  }, [mbtiResult]);
  const recommendations = useMemo(() => rankActivitiesForProfile(sceneActivityList, personalTags, recommendationSeed).slice(0,4), [personalTags, recommendationSeed, sceneActivityList]);
  const homeCards = useMemo(() => {
    const batches = [
      ["羽毛球双打","无畏契约排位组队","CPA 财管晚间共学"],
      ["城市街拍约拍","王者荣耀五排速配","数学建模竞赛组队"],
      ["密室逃脱","Switch 联机派对","商业案例大赛组队"],
      ["咖啡拉花体验","英雄联盟峡谷组队","ACM 算法刷题小组"],
    ];
    return batches[homeBatch % batches.length].map(name=>allActivities.find(item=>item.name===name)).filter(Boolean) as Activity[];
  }, [allActivities, homeBatch]);

  const currentActivity = allActivities.find(item=>item.name===activity) || activities[0];
  const roleOptions = studyRoleOptions[activity] || ["Python 编程","数据分析","论文写作","项目运营"];
  const studyGateReady = activeScene !== "study" || (studyProofs.length > 0 && weeklyHours >= 6);
  const displayTime = formatActivityTime(time);
  const matchPlan = useMemo(() => matchUsers({
    activity,
    category:currentActivity.category,
    time:displayTime,
    level,
    seats,
    campus:"杭州大学城",
    personalityTags:Array.from(new Set([...quizReport.tags,...(mbtiResult?.tags || [])])),
    personalTags,
    location:userLocation,
    requiredRole: activeScene === "study" ? studyRole : undefined,
    requiresVerifiedSkill: activeScene === "study",
  }), [activity,currentActivity.category,displayTime,level,seats,quizReport.tags,mbtiResult,personalTags,userLocation,activeScene,studyRole]);

  const venueOptions = useMemo(() => recommendVenues(
    currentActivity.category,
    [userLocation, ...matchPlan.selected.map(person=>({lat:person.lat,lng:person.lng}))],
    seats,
  ), [currentActivity.category, matchPlan.selected, seats, userLocation]);
  const selectedVenue = venueOptions.find(venue=>venue.id===selectedVenueId) || venueOptions[0];
  const baseServiceFee = 8;
  const seatPrice = baseServiceFee + (venueFeeIncluded ? (selectedVenue?.perPerson || 0) : 0);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const openMatch = (name?: string) => {
    if (name) {
      const next = allActivities.find(item=>item.name===name);
      if (next) setScene((next.scene || "offline") as Scene);
      if (studyRoleOptions[name]?.[0]) setStudyRole(studyRoleOptions[name][0]);
      setActivity(name);
      setSearchQuery(name);
    }
    setStep(1);
    setView("match");
  };

  const selectDiscoveryActivity = (name: string) => {
    const next = allActivities.find(item=>item.name===name);
    if (!next) return;
    setScene((next.scene || "offline") as Scene);
    if (studyRoleOptions[name]?.[0]) setStudyRole(studyRoleOptions[name][0]);
    setActivity(name);
    setSelectedDiscoveryActivity(name);
    setSearchQuery(name);
    notify(`已选择「${name}」，点击“开始匹配”后发送候选邀请`);
  };

  const startSelectedMatch = () => {
    const next = selectedDiscoveryActivity || activity;
    if (!next) { notify("请先选择一个项目"); return; }
    selectDiscoveryActivity(next);
    setStep(3);
    setView("match");
    notify("AI 已基于标签推荐候选人，正在等待对方确认");
  };

  const selectScene = (nextScene: Scene, target: "plaza"|"match" = "plaza") => {
    setScene(nextScene);
    setCategory("推荐");
    setSearchQuery("");
    const first = [...onlineActivities, ...studyActivities, ...activities].find(item => (item.scene || "offline") === nextScene);
    if (first) setActivity(first.name);
    if (target === "match") setStep(1);
    setView(target);
  };

  const saveLocation = (location: Coordinate) => {
    setUserLocation(location);
    localStorage.setItem("penggemian-location", JSON.stringify(location));
    setShowLocationPicker(false);
    notify(`已更新位置：${location.label}`);
  };

  const locateMe = () => {
    if (!navigator.geolocation) { setLocationState("denied"); return; }
    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      position => {
        saveLocation({lat:position.coords.latitude,lng:position.coords.longitude,label:"我的实时位置"});
        setLocationState("ready");
      },
      () => setLocationState("denied"),
      {enableHighAccuracy:true,timeout:10000,maximumAge:300000},
    );
  };

  const chooseSearchResult = (item: Activity) => {
    setScene((item.scene || "offline") as Scene);
    if (studyRoleOptions[item.name]?.[0]) setStudyRole(studyRoleOptions[item.name][0]);
    setActivity(item.name);
    setSearchQuery(item.name);
    setSelectedDiscoveryActivity(item.name);
    setStep(2);
  };

  const createCustomActivity = (event: FormEvent) => {
    event.preventDefault();
    const name = customName.trim();
    if (!name) return;
    const next: Activity = {name,category:customCategory,group:"用户自定义",icon:"新",note:"由你发起 · AI 将寻找同需求同学",meta:"自定义人数与预算",featured:false,scene,aliases:[name]};
    const updated = [next, ...customActivities.filter(item=>item.name!==name)];
    setCustomActivities(updated);
    localStorage.setItem("penggemian-custom-activities", JSON.stringify(updated));
    setShowCustomActivity(false);
    setCustomName("");
    setActivity(name);
    setSearchQuery(name);
    setStep(2);
    setView("match");
    notify("自定义活动已发布并进入匹配");
  };

  const completeBooking = (confirmedParticipants: ScoredCandidate[]) => {
    if (!selectedVenue) return;
    setRoomParticipants(confirmedParticipants);
    const record: HistoryRecord = {
      id:`booking-${Date.now()}`,
      activity,
      time:displayTime,
      venue:selectedVenue.name,
      price:seatPrice,
      createdAt:new Date().toISOString(),
      status:"已成局",
    };
    const updated = [record, ...history];
    setHistory(updated);
    localStorage.setItem("penggemian-history", JSON.stringify(updated));
    setStep(4);
  };

  const finishActivity = () => {
    const updated = history.map((record, index) => index === 0 ? {...record,status:"已完成" as const} : record);
    setHistory(updated);
    localStorage.setItem("penggemian-history", JSON.stringify(updated));
    // 复盘不属于一次成局流程；活动结束后统一沉淀在“我的”中。
    setView("review");
  };

  const saveActivityConnections = (ids: string[]) => {
    const current = JSON.parse(localStorage.getItem("penggemian-activity-connections") || "[]") as string[];
    const updated = Array.from(new Set([...current, ...ids]));
    localStorage.setItem("penggemian-activity-connections", JSON.stringify(updated));
  };

  const regroupFromActivity = () => {
    setStep(2);
    notify("已沿用本局条件，重新发起双向邀请");
  };

  const calendarEvent = () => {
    const parsed = new Date(time);
    const start = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return {
      title: `碰个面｜${activity}`,
      description: `${level} · ${seats}人局 · 席位¥${seatPrice} · ${venueFeeIncluded ? "已含场地费" : "场地费现场AA"} · 签到码 2861`,
      location: selectedVenue ? `${selectedVenue.name}｜${selectedVenue.address}` : "待确认场地",
      start,
      end: new Date(start.getTime()+2*60*60*1000),
    };
  };

  const addMobileCalendar = () => {
    const profile = downloadIcs(calendarEvent());
    const updated = history.map((record,index)=>index===0?{...record,calendarAdded:true}:record);
    setHistory(updated);
    localStorage.setItem("penggemian-history", JSON.stringify(updated));
    notify(profile.guidance);
  };

  const sendFriendRequest = (id: string) => {
    if (friendIds.includes(id) || outgoingFriendIds.includes(id)) return;
    const updated = [...outgoingFriendIds, id];
    setOutgoingFriendIds(updated);
    localStorage.setItem("penggemian-friend-outgoing", JSON.stringify(updated));
    notify("好友申请已发送");
  };

  const acceptFriendRequest = (id: string) => {
    const nextFriends = Array.from(new Set([...friendIds, id]));
    const nextIncoming = incomingFriendIds.filter(friendId => friendId !== id);
    setFriendIds(nextFriends);
    setIncomingFriendIds(nextIncoming);
    localStorage.setItem("penggemian-friends", JSON.stringify(nextFriends));
    localStorage.setItem("penggemian-friend-incoming", JSON.stringify(nextIncoming));
    notify("已添加为好友");
  };

  const ignoreFriendRequest = (id: string) => {
    const updated = incomingFriendIds.filter(friendId => friendId !== id);
    setIncomingFriendIds(updated);
    localStorage.setItem("penggemian-friend-incoming", JSON.stringify(updated));
    notify("已忽略这条申请");
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
    const suggested = allActivities.find(item=>item.category===bestCategory && item.featured) || allActivities.find(item=>item.category===bestCategory) || activities[0];
    setPreferences(previous=>Array.from(new Set([...previous,suggested.name])));
    setActivity(suggested.name);
    setStep(2);
    setView("match");
  };

  const saveMbtiResult = (result: MbtiResult) => {
    setMbtiResult(result);
    localStorage.setItem("penggemian-mbti", JSON.stringify(result));
  };

  const autoMatchFromMbti = (result: MbtiResult) => {
    saveMbtiResult(result);
    const preferredCategories = result.tags.includes("行动派") ? ["运动","户外探索"] : result.tags.includes("创作型") ? ["兴趣技能","社团社交"] : result.tags.includes("目标感") ? ["学习充电","运动"] : ["轻娱乐","社团社交"];
    const suggested = allActivities.find(item=>preferredCategories.includes(item.category) && item.featured) || activities[0];
    setPreferences(previous=>Array.from(new Set([...previous,suggested.name])));
    setActivity(suggested.name);
    setStep(2);
    setView("match");
    notify(`已将 ${result.type} 相处偏好加入匹配条件`);
  };

  const openTestCenter = () => {
    setTestMode("hub");
    setView("quiz");
  };

  const navigateProfile = (destination: ProfileDestination) => {
    if (destination === "tags") { setTagDraft(personalTags); setView("tags"); }
    else if (destination === "review") setView("review");
    else setView(destination);
  };

  const togglePersonalTag = (tag: string) => setTagDraft(current => current.includes(tag) ? current.filter(item=>item!==tag) : [...current, tag]);
  const savePersonalTags = () => {
    const next = tagDraft.length ? tagDraft : defaultPersonalTags;
    setPersonalTags(next);
    localStorage.setItem("penggemian-personal-tags", JSON.stringify(next));
    // 按标签决定首先展示的推荐场景，不用无关项目填充推荐位。
    const studySignals = ["商赛","商业案例","挑战杯","创新创业","CPA","金融","咨询","行业研究","路演","财务分析","论文写作","数学建模","ACM","算法","编程"];
    const onlineSignals = ["王者荣耀","steam","switch","PS5","瓦学弟","吃鸡达人","第五人格","金铲铲","游戏搭子"];
    // 跳转场景采用用户显式选中的主标签，避免“数码发烧友”等宽泛标签误把人带到商赛页。
    const nextScene: Scene = next.some(tag => studySignals.includes(tag)) ? "study" : next.some(tag => onlineSignals.includes(tag)) ? "online" : "offline";
    const nextActivity = rankActivitiesForProfile(allActivities.filter(item => (item.scene || "offline") === nextScene), next, recommendationSeed)[0];
    if (nextActivity) {
      setActivity(nextActivity.name);
      setSelectedDiscoveryActivity(nextActivity.name);
    }
    setScene(nextScene);
    setCategory("推荐");
    setSearchQuery("");
    notify(`已保存 ${next.length} 个个人标签，已跳转到与你标签相关的推荐项目`);
    setView("plaza");
  };

  const openScannedFriend = (userId: string) => {
    setScannedFriendId(userId);
    setFriendQuery(userId);
    setView("friends");
  };

  const navItems: Array<[View, string, string]> = [
    ["home", "⌂", "发现"],
    ["match", "♡", "匹配"],
    ["friends", "◎", "好友"],
  ];

  return <main>
    <section className="product-intro app-workspace">
      <div className="workspace-frame">
        <aside className="workspace-rail" aria-label="工作台快捷导航">
          <button className="rail-logo" onClick={()=>setView("home")}>碰</button>
          {navItems.map(([target, icon, label]) => (
            <button key={target} className={view === target ? "active" : ""} onClick={() => setView(target)}><span>{icon}</span>{label}</button>
          ))}
          <div className="rail-spacer" />
          <button className={["profile","friendCode","security","verification"].includes(view) ? "active" : ""} onClick={() => setView("profile")}><span>○</span>我的</button>
          <div className="rail-trust">🌿<small>真实校园 · 安全守护<br/>遇见同频的你</small></div>
        </aside>

        <div className={`workspace-main view-${view}`}>
          <div className="workspace-top"><button className="workspace-location" onClick={()=>setShowLocationPicker(true)}>⌖ {userLocation.label}<small>仅本机用于距离计算 · 对外模糊显示</small></button><div><button aria-label="搜索活动" onClick={()=>{setSearchQuery("");setView("match");setStep(1)}}>⌕</button><button aria-label="消息" onClick={()=>notify("暂无新消息")}>♧</button><b>Y</b></div></div>

          {view === "home" && <div className="workspace-view home-view reference-home">
  <section className="reference-hero">
    <div className="reference-title-row"><h1>今天，遇见同频的人</h1><button className="refresh-home" onClick={()=>setHomeBatch(value=>value+1)}>↻ 换一批</button></div>
    <button className={`urgent-banner ${selectedDiscoveryActivity === "麻将三缺一" ? "selected" : ""}`} onClick={()=>selectDiscoveryActivity("麻将三缺一")}><span>◷</span><b>麻将三缺一 · 19:30 截止</b><small>当前还有 1 个名额，快来凑局！</small></button>
  </section>
  <section className="reference-cards" aria-label="实时活动">
    {homeCards.map((item,index)=><button key={item.name} className={`reference-card ${["badminton","valorant","cpa"][index]} ${selectedDiscoveryActivity===item.name?"selected":""}`} onClick={()=>selectDiscoveryActivity(item.name)}><span className="reference-icon">{item.icon}</span><div><h3>{index===0&&item.name==="羽毛球双打"?"羽毛球成局":index===1&&item.name==="无畏契约排位组队"?"Valorant 速配":index===2&&item.name==="CPA 财管晚间共学"?"CPA 学习组":item.name}</h3><p>◎ {(item.scene||"offline")==="online"?"线上开黑":(item.scene||"offline")==="study"?"图书馆自习区":"杭城大学城"}　·　♧ {index+2}/{index+4} 人</p><em>{item.note}</em><footer><span>{item.category}</span><span>{index===1?"晚间时段":"本周可约"}</span><span>{item.group}</span></footer></div></button>)}
  </section>
  <button className="reference-match-button" onClick={startSelectedMatch}>开始匹配</button>
  <p className="reference-safe">♧ 真人认证　·　隐私保护　·　安全可靠</p>
</div>}

{view === "match" && <div className="workspace-view embedded-view match-view">
            <div className="view-heading"><div><span>LIVE PRODUCT DEMO</span><h2>从双向邀请，到正式活动房间</h2><p>AI负责推荐和执行流程，是否参加始终由用户确认；活动结束后可在“我的”中复盘。</p></div><b>{step}/4<small>当前进度</small></b></div>
            <div className="progress"><i style={{width:`${progress}%`}} /></div>
            <div className="demo-shell">
              <aside>{[[1,"告诉AI"],[2,"条件与安全"],[3,"邀请确认"],[4,"活动房间"]].map(([n,label])=><button key={n} className={step===n?"active":step>n?"done":""} onClick={()=>{if(n<=step)setStep(n as Step);else notify("请先完成当前环节")}}><span>{step>n?"✓":n}</span>{label}</button>)}<div className="agent-info"><span className="ai-avatar">碰</span><div><b>AI主理人正在工作</b><p>推荐候选、发邀请、递补和提醒</p></div></div></aside>
              <div className="demo-content">
                {step===1&&<div className="panel enter-panel search-panel"><span className="panel-tag">STEP 01 · {currentScene.eyebrow}</span><h3>{currentScene.title}，你想怎么组队？</h3><p>{currentScene.description} 可以搜名称、口语表达或近义词；也可从下方推荐中直接发起。</p><div className="activity-search"><span>⌕</span><input autoFocus value={searchQuery} onChange={event=>setSearchQuery(event.target.value)} placeholder={activeScene === "online" ? "搜索游戏、段位或‘开黑’…" : activeScene === "study" ? "搜索竞赛、证书或‘CPA 共学’…" : "搜索活动、兴趣或一句自然语言…"}/><button onClick={()=>setShowCustomActivity(true)}>＋ 自定义项目</button></div><div className="scene-inline-switch">{(Object.keys(scenes) as Scene[]).map(id=><button key={id} className={activeScene===id?"active":""} onClick={()=>selectScene(id,"match")}><span>{scenes[id].icon}</span>{scenes[id].title}</button>)}</div>{searchQuery.trim()?<div className="search-results">{searchResults.length?searchResults.map(item=><button key={item.name} onClick={()=>chooseSearchResult(item)}><span className="activity-icon">{item.icon}</span><div><b>{item.name}</b><p>{item.category} · {item.group} · {item.matchedBy}</p></div><em>选择 →</em></button>):<div className="search-empty"><b>暂时没有找到“{searchQuery}”</b><p>可以自己创建这个项目，发布后你会成为第一个参与匹配的人。</p><button onClick={()=>{setCustomName(searchQuery);setShowCustomActivity(true)}}>创建“{searchQuery}” →</button></div>}</div>:<><div className="semantic-examples"><span>试试搜索：</span>{(activeScene === "online" ? ["王者五排","无畏契约","LOL 开黑","Switch 联机"] : activeScene === "study" ? ["CPA 财管","数学建模","商业案例大赛","考研自习"] : ["拍照搭子","打球","桌游","一起看电影"]).map(query=><button key={query} onClick={()=>setSearchQuery(query)}>{query}</button>)}</div><div className="step1-section"><div className="step1-section-head"><b>为你推荐</b><span>基于个人标签语义：{personalTags.slice(0,3).join("、")}</span></div><div className="step1-recommend-grid">{recommendations.slice(0,4).map((result,index)=><button key={result.name} className="step1-recommend-card" onClick={()=>chooseSearchResult(result)}><span className={`activity-icon c${index}`}>{result.icon}</span><div><em>{result.category}</em><b>{result.name}</b><p>{result.profileReason}</p></div><i>选择 →</i></button>)}</div></div><div className="step1-section"><div className="step1-section-head"><b>想从分类找？</b><span>{sceneActivityList.length} 个项目 · 点选直接进入匹配</span></div><div className="step1-category-tabs">{sceneCategories[activeScene].filter(c=>c!=="推荐").map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}<small>{sceneActivityList.filter(item=>item.category===c).length}</small></button>)}</div><div className="step1-quick-grid">{sceneActivityList.filter(item=>item.category===category).slice(0,8).map((item,index)=><button className="step1-quick-card" key={item.name} onClick={()=>chooseSearchResult(item)}><span className={`activity-icon c${index%5}`}>{item.icon}</span><b>{item.name}</b><p>{item.note}</p></button>)}<button className="step1-quick-card browse-all" onClick={()=>setView("plaza")}><span className="activity-icon">→</span><b>查看全部 {sceneActivityList.length} 个项目</b><p>进入场景大厅浏览完整列表</p></button></div></div></>}</div>}
                {step===2&&<div className="panel preference-panel">
                  <span className="panel-tag">STEP 02 · CONDITIONS & SAFETY</span><h3>{activeScene === "online" ? "确认开房条件、组队偏好和隐私范围" : activeScene === "study" ? "确认目标、协作节奏和隐私范围" : "确认匹配条件、费用和隐私范围"}</h3><p>{activeScene === "online" ? "游戏 ID、房间码与语音链接均在双方确认后才对本局成员可见。" : activeScene === "study" ? "只展示目标、节奏和模糊校区；联系方式在双方确认加入后再交换。" : "精确位置只在本机参与距离计算，成局前其他人只看到“同校 · 约1—3km”。"}</p>
                  <div className="form-grid"><label>活动主题<select value={activity} onChange={e=>{const next=e.target.value;setActivity(next);if(studyRoleOptions[next]?.[0])setStudyRole(studyRoleOptions[next][0])}}>{allActivities.map(x=><option key={x.name}>{x.name}</option>)}</select></label><label>时间<input type="datetime-local" value={time} min="2026-08-17T00:00" onInput={e=>setTime(e.currentTarget.value)} onChange={e=>setTime(e.target.value)}/></label><label>水平 / 目标<select value={level} onChange={e=>setLevel(e.target.value)}><option>新手友好</option><option>同水平参与</option><option>固定互相监督</option></select></label><label>理想人数<div className="stepper"><button onClick={()=>setSeats(Math.max(4,seats-1))}>−</button><b>{seats} 人</b><button onClick={()=>setSeats(Math.min(12,seats+1))}>＋</button></div></label></div>
                  {activeScene === "study" && <section className="competency-gate">
                    <div className="competency-head"><div><span>ROLE & EVIDENCE GATE</span><h4>先确认你能承担的角色</h4><p>只推荐能力材料已核验、投入时间达标的候选人；不公开排名，也不以一次测试定义能力。</p></div><b className={studyGateReady?"ready":""}>{studyGateReady?"可参与匹配":"待完成核验"}</b></div>
                    <label className="role-field">本局希望承担的角色<select value={studyRole} onChange={e=>setStudyRole(e.target.value)}>{roleOptions.map(role=><option key={role}>{role}</option>)}</select></label>
                    <div className="proof-grid">{studyProofOptions.map(proof=><button type="button" key={proof.id} className={studyProofs.includes(proof.id)?"selected":""} onClick={()=>setStudyProofs(current=>current.includes(proof.id)?current.filter(id=>id!==proof.id):[...current,proof.id])}><i>{studyProofs.includes(proof.id)?"✓":"＋"}</i><div><b>{proof.label}</b><p>{proof.note}</p></div></button>)}</div>
                    <label className="hours-field">每周可稳定投入 <input type="number" min="2" max="40" value={weeklyHours} onChange={e=>setWeeklyHours(Math.max(0,Number(e.target.value)||0) )}/><b>小时</b></label>
                    <div className="competency-rule"><b>本局最低准入标准</b><span className={studyProofs.length?"passed":""}>{studyProofs.length?"✓ 已提交至少 1 项能力材料":"需至少选择 1 项能力材料"}</span><span className={weeklyHours>=6?"passed":""}>{weeklyHours>=6?`✓ 每周 ${weeklyHours} 小时，满足最低 6 小时`:"每周投入需不少于 6 小时"}</span></div>
                  </section>}
                  {activeScene === "offline" ? <button className="location-summary" onClick={()=>setShowLocationPicker(true)}><span>⌖</span><div><b>{userLocation.label}</b><p>仅用于公平选址，不向候选人公开坐标</p></div><em>更改 →</em></button> : <div className="scene-condition-note"><span>{activeScene === "online" ? "⌁" : "◇"}</span><div><b>{activeScene === "online" ? "双向确认后创建临时房间" : "双向确认后建立协作空间"}</b><p>{activeScene === "online" ? "游戏 ID、房间码和语音链接不会被公开展示。" : "先完成目标和时间对齐，再建立共享任务清单。"}</p></div></div>}
                  <SafetyControls value={audienceRules} onChange={setAudienceRules} onNotify={notify}/>
                  {activeScene === "offline" ? <div className="fee-choice"><div><b>席位价格</b><p>当前 ¥{seatPrice}/席，成局前锁定费用口径。</p></div><button className={venueFeeIncluded?"selected":""} onClick={()=>setVenueFeeIncluded(true)}>包含场地费</button><button className={!venueFeeIncluded?"selected":""} onClick={()=>setVenueFeeIncluded(false)}>场地费现场 AA</button></div> : <div className="fee-choice"><div><b>{activeScene === "online" ? "房间与组队规则" : "协作成本与交付规则"}</b><p>{activeScene === "online" ? "默认免费开房；如涉及付费游戏或陪练，必须在邀请前明确。" : "默认免费共学；如有资料、报名或工具费用，须在邀请前标明。"}</p></div><button className="selected">费用先说明</button></div>}
                  <div className="question"><b>把活动规则先说清楚</b><p>选择最重要的一条约定</p><div>{["提前4小时可取消","各自AA，不代付","不强社交，按时结束"].map(x=><button key={x} className={answer===x?"selected":""} onClick={()=>setAnswer(x)}>{x}</button>)}</div></div>
                  <button className="wide-button" onClick={()=>{if(activeScene === "study" && !studyGateReady){notify("竞赛 / 共学项目需先提交至少一项能力材料，并承诺每周 6 小时投入");return}setSelectedVenueId(venueOptions[0]?.id||"");setStep(3)}}>{activeScene === "online" ? "推荐队友并分别发送开房邀请" : activeScene === "study" ? "推荐搭子并分别发送协作邀请" : "推荐候选人并分别发送邀请"} <span>不会直接宣布成局 →</span></button>
                </div>}
                {step===3&&<InvitationMatch key={`${activity}-${time}-${seats}`} matchPlan={matchPlan} activity={activity} time={displayTime} seats={seats} level={level} userLocation={userLocation} venues={venueOptions} selectedVenueId={selectedVenueId} venueFeeIncluded={venueFeeIncluded} seatPrice={seatPrice} onSelectVenue={setSelectedVenueId} onFormActivity={completeBooking} onNotify={notify}/>}
                {step===4&&selectedVenue&&<ActivityRoom activity={activity} time={displayTime} seats={seats} seatPrice={seatPrice} venueFeeIncluded={venueFeeIncluded} selectedVenue={selectedVenue} venues={venueOptions} participants={roomParticipants.length ? roomParticipants : matchPlan.selected} onSelectVenue={setSelectedVenueId} onAddMobileCalendar={addMobileCalendar} onEndActivity={finishActivity} onNotify={notify}/>}
              </div>
            </div>
          </div>}

          {view === "plaza" && <div className="workspace-view embedded-view plaza-view">
            <div className="view-heading plaza-heading"><div><span>{scenes[scene].eyebrow}</span><h2>{scenes[scene].title}大厅</h2><p>{scenes[scene].description} AI 会根据不同场景切换就近选址、建房组队或长期协作的流程。</p></div><b>{category === "推荐" ? 4 : sceneActivityList.filter(x=>x.category===category).length}<small>{category === "推荐" ? "个性化推荐" : `${category}项目`}</small></b></div>
            <div className="plaza-scene-switch">{(Object.keys(scenes) as Scene[]).map(id=><button key={id} className={scene===id?"active":""} onClick={()=>selectScene(id)}><span>{scenes[id].icon}</span><div><small>{scenes[id].eyebrow}</small><b>{scenes[id].title}</b></div><em>{scenes[id].detail}</em></button>)}</div>
            <div className="category-tabs">{sceneCategories[scene].map(x=><button key={x} className={category===x?"active":""} onClick={()=>{setCategory(x);setSearchQuery("")}}>{x}<small>{x === "推荐" ? 4 : sceneActivityList.filter(item=>item.category===x).length}</small></button>)}</div>
            {category === "推荐" ? <><div className="recommend-toolbar"><span>根据个人标签语义生成，每次展示 4 个 {scenes[scene].title}项目</span><div><button onClick={()=>setView("tags")}>调整标签</button><button onClick={()=>setRecommendationSeed(seed=>seed+1)}>换一组</button></div></div><div className="activity-grid recommendation-grid">{recommendations.map((result,i)=><button className="activity-card" key={result.name} onClick={()=>selectDiscoveryActivity(result.name)}><span className={`activity-icon c${i%5}`}>{result.icon}</span><div><em>{result.category}</em><h3>{result.name}</h3><p>{result.profileReason}</p><b>{result.meta}</b></div><i>选择项目 →</i></button>)}</div></> : <><div className="plaza-summary"><div><span className="summary-spark">✦</span><div><b>{category} · {sceneActivityList.filter(x=>x.category===category).length} 个可发起项目</b><p>{scene === "online" ? "点选后确认段位、位置和语音偏好；双方同意后才交换游戏 ID 与房间码。" : scene === "study" ? "点选后确认目标、协作周期和角色；双方同意后才建立协作空间。" : "点选任意活动，直接进入 AI 成局流程；人数、水平、时间和费用都可以继续确认。"}</p></div></div><button onClick={()=>openMatch()}>直接告诉 AI →</button></div><div className="activity-groups">{Array.from(new Set(sceneActivityList.filter(x=>x.category===category).map(x=>x.group))).map(group=><section className="activity-section" key={group}><div className="activity-section-title"><h3>{group}</h3><span>{sceneActivityList.filter(x=>x.category===category&&x.group===group).length} 个项目</span></div><div className="activity-grid">{sceneActivityList.filter(x=>x.category===category&&x.group===group).map((x,i)=><button className="activity-card" key={x.name} onClick={()=>selectDiscoveryActivity(x.name)}><span className={`activity-icon c${i%5}`}>{x.icon}</span><div><em>{x.category} · {x.group}</em><h3>{x.name}</h3><p>{x.note}</p><b>{x.meta}</b></div><i>{scene === "online" ? "开始组队 →" : scene === "study" ? "发起协作 →" : "交给 AI 成局 →"}</i></button>)}</div></section>)}</div></>}
          </div>}

          {view === "quiz" && <div className="workspace-view embedded-view quiz-view">
            {testMode === "hub" && <><div className="view-heading"><div><span>PERSONALITY TEST CENTER</span><h2>两个测试，两种匹配线索</h2><p>活动性格回答“你适合玩什么”，MBTI回答“你更习惯怎样与人相处”。</p></div><b>2<small>个测试</small></b></div><div className="test-center-grid"><button onClick={()=>setTestMode("activity")}><span className="test-number">01</span><div className="test-orb activity">活</div><em>ACTIVITY PERSONALITY</em><h3>校园活动性格测试</h3><p>4个具体场景，推断运动、娱乐、技能、社团和探索偏好。</p><div><span>{quizAnswers.length ? "已有测试记录" : "约1分钟"}</span><b>开始测试 →</b></div></button><button onClick={()=>setTestMode("mbti")}><span className="test-number">02</span><div className="test-orb mbti">{mbtiResult?.type || "MBTI"}</div><em>SOCIAL PREFERENCE</em><h3>MBTI 社交偏好测试</h3><p>12个校园场景，计算E/I、S/N、T/F、J/P四个维度。</p><div><span>{mbtiResult ? `${mbtiResult.type} · ${mbtiResult.title}` : "约3分钟"}</span><b>{mbtiResult ? "查看报告" : "开始测试"} →</b></div></button></div><div className="test-center-note"><span>✦</span><div><b>两个结果都会进入匹配，但权重不同</b><p>活动兴趣和可用时间优先；性格结果只用于相处偏好与AI破冰，不会把你固定在某种类型里。</p></div></div></>}
            {testMode === "activity" && <><div className="view-heading"><div><button className="test-back" onClick={()=>setTestMode("hub")}>← 测试中心</button><span>ACTIVITY PERSONALITY LAB</span><h2>你适合怎样的校园活动？</h2><p>4 个问题推断你的活动偏好，并推荐合适的候选人。</p></div><b>{Math.min(quizStep+1,quizQuestions.length)}/{quizQuestions.length}<small>{quizStep<quizQuestions.length?"测试进度":"报告已生成"}</small></b></div>{quizStep < quizQuestions.length ? <div className="quiz-shell"><div className="quiz-progress"><i style={{width:`${(quizStep+1)/quizQuestions.length*100}%`}}/></div><span>QUESTION {String(quizStep+1).padStart(2,"0")}</span><h3>{quizQuestions[quizStep].question}</h3><div className="quiz-answers">{quizQuestions[quizStep].answers.map((quizAnswer,index)=><button key={quizAnswer.label} onClick={()=>answerQuiz(index)}><i>{String.fromCharCode(65+index)}</i><span>{quizAnswer.label}</span><em>→</em></button>)}</div>{quizStep>0&&<button className="quiz-back" onClick={()=>setQuizStep(quizStep-1)}>← 上一题</button>}</div> : <div className="quiz-report"><div className="report-orb">{quizReport.tags[0]?.slice(0,1)||"趣"}</div><span>YOUR ACTIVITY TYPE</span><h3>{quizReport.type}</h3><p>你更容易在“有共同目标、又不过度尬聊”的活动中获得能量。</p><div className="report-categories">{quizReport.categories.slice(0,3).map((name,index)=><div key={name}><b>0{index+1}</b><span>{name}</span><i style={{width:`${92-index*14}%`}}/></div>)}</div><div className="report-picks">{activities.filter(item=>quizReport.categories.slice(0,2).includes(item.category)).slice(0,3).map(item=><button key={item.name} onClick={()=>openMatch(item.name)}>{item.icon} {item.name}</button>)}</div><button className="report-match" onClick={autoMatchFromQuiz}>根据报告推荐候选并发邀请 →</button><button className="report-retry" onClick={()=>{setQuizAnswers([]);setQuizStep(0)}}>重新测试</button></div>}</>}
            {testMode === "mbti" && <MbtiTest savedResult={mbtiResult} onBack={()=>setTestMode("hub")} onComplete={saveMbtiResult} onMatch={autoMatchFromMbti}/>}
          </div>}

          {view === "partners" && <div className="workspace-view embedded-view partner-view"><div className="view-heading"><div><span>CAMPUS PARTNER NETWORK</span><h2>机构接入</h2><p>社团、校园墙和场地商家接入同一个活动网络。</p></div></div><div className="partner-shell"><div className="partner-tabs">{["学生社团","校园墙","场地商家"].map(x=><button className={partner===x?"active":""} key={x} onClick={()=>setPartner(x)}>{x}</button>)}</div><div className="partner-content"><div className="partner-copy"><span className="partner-type">{partner}接入空间</span><h3>{partner==="学生社团"?"把一次招新，变成持续活动供给":partner==="校园墙"?"从发布信息，升级为可报名的校园频道":"把空闲场地，变成稳定的学生订单"}</h3><p>{partner==="学生社团"?"乐器社、舞蹈社、摄影社等获得认证主页；AI处理报名、收费、候补、签到和复盘。":partner==="校园墙"?"帖子可一键转为结构化活动卡，按学校分发并追踪报名与到场。":"台球厅、桌游店、影院和球馆可发布校园时段，自动拼场。"}</p><div className="partner-benefits"><span>✓ 认证主页</span><span>✓ 一键分发</span><span>✓ 候补签到</span><span>✓ 收益结算</span></div><button onClick={()=>notify(`${partner}接入申请 Demo 已提交`)}>申请接入 →</button></div><div className="org-preview"><div className="org-head"><span>{partner==="学生社团"?"乐":partner==="校园墙"?"墙":"店"}</span><div><b>{partner==="学生社团"?"杭城大学吉他社":partner==="校园墙"?"杭城大学校园墙":"南门青年台球俱乐部"}</b><p>负责人已认证 · 本校可见</p></div><em>已接入</em></div><div className="org-stats"><div><b>1,286</b><span>关注学生</span></div><div><b>32</b><span>已完成活动</span></div><div><b>91%</b><span>平均到场率</span></div></div><div className="org-event"><span>本周活动</span><b>{partner==="学生社团"?"零基础吉他合奏体验":partner==="校园墙"?"周五校园露天电影夜":"台球新手四人练习局"}</b><p>AI已完成场地、规则和报名配置</p><button onClick={()=>notify("已加入活动候补名单")}>查看并报名</button></div></div></div></div></div>}

          {view === "business" && <div className="workspace-view embedded-view business-view"><div className="view-heading"><div><span>FOR BRAND & VENUE</span><h2>品牌合作</h2><p>按真实到场、商品体验与成交结果获得校园增长。</p></div></div><div className="business-dashboard"><div><h3>每次成局，都是一次真实消费。</h3><p>席位、场地、物资与天猫商品在同一订单链路中完成。</p><div className="stats"><div><b>同校</b><span>身份已核验</span></div><div><b>守约率</b><span>活动后沉淀</span></div><div><b>全链路</b><span>报名至核销</span></div></div><button onClick={()=>notify("合作方案：按到场、核销或成交结算")}>查看合作方案 →</button></div><div className="funnel-card"><div className="funnel-head"><div><span className="brand-dot">N</span><div><b>运动品牌校园体验局</b><p>演示数据 · 杭州 · 5所高校</p></div></div><em>模拟看板</em></div><div className="metric-row"><div><span>活动场次</span><b>24</b></div><div><span>真实到场</span><b>386</b></div><div><span>天猫成交</span><b>¥28.6k</b></div></div><div className="bars"><span style={{height:"48%"}}/><span style={{height:"68%"}}/><span style={{height:"60%"}}/><span style={{height:"87%"}}/><span style={{height:"72%"}}/><span style={{height:"94%"}}/></div></div></div></div>}

          {view === "history" && <div className="workspace-view embedded-view history-view"><div className="view-heading"><div><span>MY ACTIVITY LEDGER</span><h2>过往活动记录</h2><p>这里读取的是你在当前 Demo 中真实完成的成局记录，不是预置展示卡片。</p></div><b>{history.length}<small>条本机记录</small></b></div>{history.length?<div className="history-list">{history.map(record=><article key={record.id}><div className="history-icon">✓</div><div><span>{new Date(record.createdAt).toLocaleString("zh-CN")}</span><h3>{record.activity}</h3><p>{record.time} · {record.venue}</p></div><div className="history-meta"><b>¥{record.price}</b><em>{record.status}</em><small>{record.calendarAdded?"已导入日历":"未导入日历"}</small></div><button onClick={()=>openMatch(record.activity)}>再次发起 →</button></article>)}</div>:<div className="history-empty"><span>↺</span><h3>还没有真实活动记录</h3><p>完成一次“确认并购买席位”的 Demo 流程后，记录会立即写入并可在这里查询。</p><button onClick={()=>openMatch()}>开始第一次匹配 →</button></div>}<div className="storage-note"><b>记录机制</b><p>当前版本未要求登录，因此记录保存在本设备浏览器中；接入校园账号后可替换为云端数据库，实现跨设备查询。</p></div></div>}

          {view === "profile" && <ProfileCenter verificationStatus={verificationStatus} tagCount={personalTags.length} activityCount={history.length} onNavigate={navigateProfile}/>}

          {view === "tags" && <div className="workspace-view embedded-view tag-view"><div className="view-heading"><div><span>PERSONAL MATCH TAGS</span><h2>个人标签</h2><p>标签不公开展示；它们会扩展为近义语义，用于排序活动和筛选更适合一起参加的人。</p></div><b>{tagDraft.length}<small>已选择</small></b></div><div className="tag-algorithm-note"><b>算法如何使用</b><span>标签 → 语义扩展（如“王者荣耀”→ MOBA / 开黑）→ 活动召回 → 同频候选人排序 → 分别发送邀请</span></div><div className="tag-groups">{personalTagGroups.map((group,index)=><section key={index}><small>{["性格与生活方式","游戏与数码兴趣","技能与内容偏好","MBTI","学习与竞赛目标"][index]}</small><div>{group.map(tag=><button key={tag} className={tagDraft.includes(tag)?"selected":""} onClick={()=>togglePersonalTag(tag)}>{tagDraft.includes(tag)?"✓ ":"＋ "}{tag}</button>)}</div></section>)}</div><div className="tag-actions"><button onClick={()=>setView("profile")}>取消</button><button className="primary" onClick={savePersonalTags}>保存并查看推荐 →</button></div></div>}

          {view === "review" && <div className="workspace-view embedded-view review-view"><div className="view-heading"><div><span>ACTIVITY REVIEW & REGROUP</span><h2>活动复盘</h2><p>评价体验、私密选择愿意再次同局的人，并在双方同意后完成好友、复组或长期小组。</p></div></div><PostActivity activity={history[0]?.activity || activity} participants={roomParticipants.length ? roomParticipants : matchPlan.selected} onRegroup={regroupFromActivity} onSaveConnections={saveActivityConnections} onNotify={notify}/></div>}

          {view === "friendCode" && <FriendCodePanel userId="PG20260814" nickname="Young" onBack={()=>setView("profile")} onScanned={openScannedFriend} onNotify={notify}/>}

          {view === "security" && <AccountCenter mode="security" verificationStatus={verificationStatus} onBack={()=>setView("profile")} onOpenVerification={()=>setView("verification")} onStatusChange={setVerificationStatus} onNotify={notify}/>}

          {view === "verification" && <AccountCenter mode="verification" verificationStatus={verificationStatus} onBack={()=>setView("security")} onOpenVerification={()=>setView("verification")} onStatusChange={setVerificationStatus} onNotify={notify}/>}

          {view === "friends" && <div className="workspace-view embedded-view friends-view"><div className="view-heading"><div><span>CAMPUS FRIEND NETWORK</span><h2>好友</h2><p>按碰个面 ID、昵称或二维码找到同校同学，发出好友申请。</p></div><b>{friends.length}<small>位本机好友</small></b></div>{scannedFriendId&&<div className="scanned-friend-banner"><span>▦</span><div><b>好友码校验通过</b><p>识别到碰个面ID：{scannedFriendId}</p></div>{outgoingFriendIds.includes(scannedFriendId)?<button disabled>等待对方通过</button>:<button onClick={()=>sendFriendRequest(scannedFriendId)}>＋ 发送好友申请</button>}<button className="scan-dismiss" onClick={()=>setScannedFriendId("")}>×</button></div>}<div className="friend-identity"><div><span>Y</span><div><small>我的碰个面 ID</small><b>PG20260814</b><p>杭城大学 · 大学生认证状态：{verificationStatus==="verified"?"已认证":verificationStatus==="reviewing"?"审核中":"未认证"}</p></div></div><div className="friend-identity-actions"><button onClick={()=>setView("friendCode")}>▦ 好友码 / 扫一扫</button><button onClick={async()=>{await navigator.clipboard.writeText("PG20260814");notify("我的好友 ID 已复制")}}>复制 ID</button></div></div><div className="friend-layout"><section className="friend-discovery"><div className="friend-search"><span>⌕</span><input autoFocus value={friendQuery} onChange={event=>setFriendQuery(event.target.value)} placeholder="搜索好友 ID 或昵称，例如 PG10086、林一帆"/><button onClick={()=>setFriendQuery(friendQuery.trim())}>搜索</button></div><div className="friend-result-head"><b>{friendQuery.trim()?`“${friendQuery}”的搜索结果`:"可能认识的同学"}</b><span>{friendResults.length} 人</span></div>{friendResults.length?<div className="friend-results">{friendResults.map(profile=>{const isFriend=friendIds.includes(profile.id);const isOutgoing=outgoingFriendIds.includes(profile.id);const isIncoming=incomingFriendIds.includes(profile.id);return <article key={profile.id}><span className="friend-avatar">{profile.avatar}</span><div className="friend-copy"><div><h3>{profile.nickname}</h3><em>{profile.id}</em></div><p>{profile.school} · {profile.grade} · {profile.major}</p><div>{profile.tags.map(tag=><small key={tag}>{tag}</small>)}</div><i>{profile.mutual?`${profile.mutual} 位共同好友 · `:""}{profile.lastActive}</i></div>{isFriend?<button className="friend-state" disabled>已是好友</button>:isIncoming?<button className="friend-accept" onClick={()=>acceptFriendRequest(profile.id)}>同意申请</button>:isOutgoing?<button className="friend-state" disabled>等待通过</button>:<button className="friend-add" onClick={()=>sendFriendRequest(profile.id)}>＋ 添加好友</button>}</article>})}</div>:<div className="friend-empty"><span>⌕</span><h3>没有找到这个用户</h3><p>请检查完整 ID 或昵称是否正确；校园身份未完成的用户不会出现在搜索结果中。</p></div>}</section><aside className="friend-side">{incomingFriends.length>0&&<div className="friend-panel"><div className="friend-panel-title"><b>新的好友申请</b><span>{incomingFriends.length}</span></div>{incomingFriends.map(profile=><div className="friend-request" key={profile.id}><span>{profile.avatar}</span><div><b>{profile.nickname}</b><p>{profile.id} · {profile.school}</p></div><button onClick={()=>acceptFriendRequest(profile.id)}>同意</button><button onClick={()=>ignoreFriendRequest(profile.id)}>忽略</button></div>)}</div>}<div className="friend-panel"><div className="friend-panel-title"><b>我的好友</b><span>{friends.length}</span></div>{friends.length?friends.map(profile=><button className="friend-row" key={profile.id} onClick={()=>notify(`已打开与 ${profile.nickname} 的聊天 Demo`)}><span>{profile.avatar}</span><div><b>{profile.nickname}</b><p>{profile.lastActive}</p></div><em>聊天 →</em></button>):<div className="friend-side-empty"><span>◎</span><p>添加的好友会出现在这里</p></div>}</div></aside></div></div>}
        </div>
      </div>
    </section>
    {showOnboarding&&<div className="onboarding-layer" role="dialog" aria-modal="true" aria-label="选择活动偏好"><div className="onboarding-card"><span className="onboarding-mark">碰</span><em>WELCOME TO 碰个面</em><h2>平常你对什么感兴趣？</h2><p>选 3 个左右就好。推荐只会优先参考，不会把你困在标签里。</p><div className="preference-grid">{preferenceOptions.map(name=><button key={name} className={preferenceDraft.includes(name)?"selected":""} onClick={()=>setPreferenceDraft(list=>list.includes(name)?list.filter(item=>item!==name):[...list,name])}><span>{activities.find(item=>item.name===name)?.icon}</span>{name}<i>{preferenceDraft.includes(name)?"✓":"＋"}</i></button>)}</div><div className="onboarding-actions"><button className="discover-personality" onClick={()=>{setShowOnboarding(false);openTestCenter()}}>还不知道，进入测试中心</button><button className="save-preferences" onClick={finishPreferences}>{preferenceDraft.length?`用这 ${preferenceDraft.length} 个生成推荐 →`:"先随便逛逛吧 →"}</button></div></div></div>}
    {showCustomActivity&&<div className="modal-layer" role="dialog" aria-modal="true" aria-label="创建自定义活动"><form className="action-modal" onSubmit={createCustomActivity}><button type="button" className="modal-close" onClick={()=>setShowCustomActivity(false)}>×</button><span>CREATE YOUR OWN ACTIVITY</span><h2>没有现成活动？自己发起。</h2><p>发布后你会自动成为首位参与者，AI 会继续寻找相同需求的同学。</p><label>活动名称<input autoFocus value={customName} onChange={event=>setCustomName(event.target.value)} placeholder="例如：校园航拍入门"/></label><label>活动分类<select value={customCategory} onChange={event=>setCustomCategory(event.target.value)}>{plazaCategories.filter(item=>item!=="推荐").map(item=><option key={item}>{item}</option>)}</select></label><button className="modal-primary" type="submit">发布并参与匹配 →</button></form></div>}
    {showLocationPicker&&<div className="modal-layer" role="dialog" aria-modal="true" aria-label="查询或更改位置"><div className="action-modal location-modal"><button type="button" className="modal-close" onClick={()=>setShowLocationPicker(false)}>×</button><span>LOCATION FOR FAIR MEETUP</span><h2>选择大致出发区域</h2><p>精确坐标只在本机用于距离计算和公平选址，匹配前不会展示给其他同学。</p><button className="locate-button" onClick={locateMe} disabled={locationState==="locating"}><i>◎</i><div><b>{locationState==="locating"?"正在查询浏览器位置…":"使用我的实时位置"}</b><small>{locationState==="denied"?"未获授权，可从下方手动选择":"浏览器会先请求你的定位许可"}</small></div><em>查询 →</em></button><AmapVenueMap center={userLocation} onPickLocation={location=>{setUserLocation(location);localStorage.setItem("penggemian-location",JSON.stringify(location));notify("已使用高德地图更新大致位置")}}/><div className="preset-locations">{campusLocations.map(location=><button className={userLocation.label===location.label?"selected":""} key={location.label} onClick={()=>saveLocation(location)}><b>{location.label}</b><span>对外仅显示“同校 · 约1—3km”</span></button>)}</div><div className="privacy-note">不公开宿舍、精确坐标或实时轨迹；位置仅保存在当前设备。</div></div></div>}
    {toast&&<div className="toast">✓ {toast}</div>}
  </main>;
}
