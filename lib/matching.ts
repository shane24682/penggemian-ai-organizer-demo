import { semanticOverlap } from "./discovery";

export type MatchLevel = "新手" | "入门" | "进阶";

export type MatchCandidate = {
  id: string;
  name: string;
  campus: string;
  categories: string[];
  interests: string[];
  availability: string[];
  level: MatchLevel;
  socialTags: string[];
  profileTags?: string[];
  trustRate: number;
  distanceKm: number;
  lat: number;
  lng: number;
  avatar: string;
  roles?: string[];
  verifiedSkills?: string[];
  weeklyHours?: number;
};

export type MatchRequest = {
  activity: string;
  category: string;
  time: string;
  level: string;
  seats: number;
  campus: string;
  personalityTags: string[];
  personalTags?: string[];
  location?: {lat:number;lng:number};
  requiredRole?: string;
  requiresVerifiedSkill?: boolean;
};

export type ScoredCandidate = MatchCandidate & {
  score: number;
  reasons: string[];
};

export type MatchPlan = {
  selected: ScoredCandidate[];
  backups: ScoredCandidate[];
  averageScore: number;
  factors: string[];
};

export const demoCandidates: MatchCandidate[] = [
  {id:"u01",name:"林小满",campus:"杭州大学城",categories:["运动","户外探索"],interests:["羽毛球双打","校园夜跑打卡","登山徒步"],availability:["周六 15:00","周日 10:00"],level:"入门",socialTags:["轻社交","行动派"],profileTags:["健身达人","旅行家","体育生","自来熟"],trustRate:.98,distanceKm:1.2,lat:30.3108,lng:120.3524,avatar:"林"},
  {id:"u02",name:"周屿",campus:"杭州大学城",categories:["运动","轻娱乐"],interests:["篮球3V3","台球斯诺克","Switch派对游戏"],availability:["周六 15:00","周六 19:00"],level:"入门",socialTags:["组队型","热闹"],trustRate:.96,distanceKm:2.1,lat:30.3066,lng:120.3658,avatar:"周"},
  {id:"u03",name:"孟然",campus:"杭州大学城",categories:["兴趣技能","社团社交"],interests:["城市街拍约拍","咖啡拉花体验","外语角"],availability:["周六 15:00","周日 10:00"],level:"新手",socialTags:["慢热","创作型"],profileTags:["咖啡脑袋","vlog生活家","P图大师","INFJ"],trustRate:1,distanceKm:.8,lat:30.3182,lng:120.3471,avatar:"孟"},
  {id:"u04",name:"陈一禾",campus:"杭州大学城",categories:["运动","学习充电"],interests:["飞盘争夺赛","圆桌读书会","模拟面试官"],availability:["周六 15:00","周六 19:00"],level:"入门",socialTags:["行动派","目标感"],trustRate:.94,distanceKm:1.8,lat:30.3017,lng:120.3581,avatar:"陈"},
  {id:"u05",name:"许诺",campus:"杭州大学城",categories:["轻娱乐","兴趣技能"],interests:["剧本杀","陶艺拉坯","乐队合奏"],availability:["周六 19:00","周日 10:00"],level:"新手",socialTags:["沉浸型","创作型"],trustRate:.97,distanceKm:2.4,lat:30.3139,lng:120.3398,avatar:"许"},
  {id:"u06",name:"赵今安",campus:"杭州大学城",categories:["轻娱乐","社团社交"],interests:["麻将三缺一","狼人杀","深夜夜聊茶话会"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["热闹","组队型"],profileTags:["网络梗王","王者荣耀","e人","剧本杀"],trustRate:.92,distanceKm:1.1,lat:30.3081,lng:120.3492,avatar:"赵"},
  {id:"u07",name:"唐梨",campus:"杭州大学城",categories:["兴趣技能","户外探索"],interests:["Vlog创作","油菜花田写生","Citywalk人文历史路线"],availability:["周六 15:00","周日 10:00"],level:"入门",socialTags:["创作型","探索欲"],trustRate:.99,distanceKm:1.6,lat:30.3188,lng:120.3612,avatar:"唐"},
  {id:"u08",name:"顾言",campus:"杭州大学城",categories:["学习充电","社团社交"],interests:["奇葩说式辩论赛","TEDx观影会","方言趣味教学"],availability:["周六 19:00","周日 10:00"],level:"进阶",socialTags:["表达型","目标感"],trustRate:.95,distanceKm:2.9,lat:30.2998,lng:120.3433,avatar:"顾"},
  {id:"u09",name:"沈知夏",campus:"杭州大学城",categories:["运动","户外探索"],interests:["匹克球体验","环湖骑行","露营烧烤"],availability:["周六 15:00","周日 10:00"],level:"新手",socialTags:["行动派","探索欲"],trustRate:.93,distanceKm:3.2,lat:30.2928,lng:120.3740,avatar:"沈"},
  {id:"u10",name:"陆川",campus:"杭州大学城",categories:["轻娱乐","运动"],interests:["网吧5V5开黑","篮球3V3","保龄球"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["竞技型","组队型"],profileTags:["数码发烧友","steam","PS5","王者荣耀","ENTP"],trustRate:.9,distanceKm:2.7,lat:30.3041,lng:120.3308,avatar:"陆"},
  {id:"u11",name:"苏木",campus:"杭州大学城",categories:["兴趣技能","学习充电"],interests:["尤克里里速成课","手机短视频剪辑","PPT设计工坊"],availability:["周六 15:00","周日 10:00"],level:"新手",socialTags:["慢热","创作型"],trustRate:.98,distanceKm:1.4,lat:30.3210,lng:120.3530,avatar:"苏"},
  {id:"u12",name:"韩冬",campus:"杭州大学城",categories:["社团社交","户外探索"],interests:["动漫Cosplay外拍","寻找城市地标打卡","电竞赛事集体观赛"],availability:["周六 19:00","周日 10:00"],level:"入门",socialTags:["同好型","探索欲"],trustRate:.96,distanceKm:2,lat:30.3074,lng:120.3722,avatar:"韩"},
  {id:"u13",name:"程予安",campus:"杭州大学城",categories:["竞赛组队","技能共学"],interests:["数学建模竞赛组队","ACM 算法刷题小组"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["目标感","行动派"],profileTags:["数码发烧友","理科生","学霸","INTP","web3.0"],trustRate:.98,distanceKm:1.5,lat:30.3134,lng:120.3512,avatar:"程",roles:["Python 编程","建模求解"],verifiedSkills:["算法训练营结业","GitHub 作品集"],weeklyHours:12},
  {id:"u14",name:"顾思齐",campus:"杭州大学城",categories:["竞赛组队","证书共学"],interests:["数学建模竞赛组队","CPA 财管晚间共学"],availability:["周六 19:00","周日 10:00"],level:"进阶",socialTags:["表达型","目标感"],profileTags:["数学建模","论文写作","数据分析","学霸"],trustRate:.97,distanceKm:2.2,lat:30.3072,lng:120.3577,avatar:"顾",roles:["论文写作","数据分析"],verifiedSkills:["建模校赛参赛证明","课程成绩单"],weeklyHours:10},
  {id:"u15",name:"叶知行",campus:"杭州大学城",categories:["竞赛组队","长期共学"],interests:["商业案例大赛组队","挑战杯项目匹配"],availability:["周六 15:00","周日 10:00"],level:"入门",socialTags:["组队型","目标感"],profileTags:["商赛","商业案例","咨询","路演","金融"],trustRate:.96,distanceKm:1.9,lat:30.3105,lng:120.3435,avatar:"叶",roles:["行业研究","路演表达"],verifiedSkills:["咨询社案例作品","演讲比赛证书"],weeklyHours:8},
  {id:"u16",name:"宋念",campus:"杭州大学城",categories:["证书共学","长期共学"],interests:["CPA 财管晚间共学","考研监督自习组"],availability:["周六 19:00","周日 10:00"],level:"进阶",socialTags:["目标感","慢热"],profileTags:["CPA","财管","金融","学霸"],trustRate:.99,distanceKm:1.1,lat:30.3153,lng:120.3498,avatar:"宋",roles:["CPA 财管","打卡监督"],verifiedSkills:["CPA 已过科目证明","学习计划"],weeklyHours:14},
  {id:"u17",name:"陆言",campus:"杭州大学城",categories:["竞赛组队","技能共学"],interests:["商业案例大赛组队","挑战杯项目匹配"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["行动派","表达型"],profileTags:["挑战杯","创新创业","产品设计","项目运营"],trustRate:.95,distanceKm:2.5,lat:30.3048,lng:120.3612,avatar:"陆",roles:["产品设计","项目运营"],verifiedSkills:["产品作品集","校级创新项目成员证明"],weeklyHours:9},
  {id:"u18",name:"方予宁",campus:"杭州大学城",categories:["竞赛组队","技能共学"],interests:["商业案例大赛组队","挑战杯项目匹配"],availability:["周六 15:00","周六 19:00","周日 10:00"],level:"进阶",socialTags:["目标感","行动派"],profileTags:["商赛","商业案例","金融","行业研究","咨询"],trustRate:.98,distanceKm:1.3,lat:30.3171,lng:120.3558,avatar:"方",roles:["财务分析","行业研究"],verifiedSkills:["商赛决赛证明","财务建模作品"],weeklyHours:12},
  {id:"u19",name:"姜予墨",campus:"杭州大学城",categories:["竞赛组队","长期共学"],interests:["商业案例大赛组队","挑战杯项目匹配"],availability:["周六 15:00","周日 10:00"],level:"入门",socialTags:["组队型","表达型"],profileTags:["挑战杯","创新创业","路演","项目运营"],trustRate:.97,distanceKm:2.0,lat:30.3006,lng:120.3491,avatar:"姜",roles:["路演表达","项目运营"],verifiedSkills:["创新创业训练计划立项","路演视频"],weeklyHours:10},
  {id:"u20",name:"魏星河",campus:"杭州大学城",categories:["竞赛组队","技能共学"],interests:["数学建模竞赛组队","ACM 算法刷题小组"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["目标感","慢热"],profileTags:["数学建模","算法","编程","数码发烧友"],trustRate:.96,distanceKm:2.6,lat:30.3127,lng:120.3374,avatar:"魏",roles:["建模求解","Python 编程"],verifiedSkills:["省级建模参赛证明","代码仓库"],weeklyHours:13},
  {id:"u21",name:"罗清禾",campus:"杭州大学城",categories:["竞赛组队","长期共学"],interests:["挑战杯项目匹配","论文写作共创小组"],availability:["周六 19:00","周日 10:00"],level:"进阶",socialTags:["创作型","目标感"],profileTags:["挑战杯","论文写作","创新创业","数据分析"],trustRate:.98,distanceKm:1.7,lat:30.3202,lng:120.3444,avatar:"罗",roles:["论文写作","数据分析"],verifiedSkills:["论文发表截图","科研项目证明"],weeklyHours:11},
  {id:"u22",name:"夏知远",campus:"杭州大学城",categories:["证书共学","竞赛组队"],interests:["CPA 财管晚间共学","商业案例大赛组队"],availability:["周六 15:00","周六 19:00","周日 10:00"],level:"进阶",socialTags:["目标感","组队型"],profileTags:["CPA","财管","商业案例","金融"],trustRate:.97,distanceKm:2.3,lat:30.2962,lng:120.3566,avatar:"夏",roles:["CPA 财管","财务分析"],verifiedSkills:["CPA 成绩单","Excel 模型作品"],weeklyHours:12},
  {id:"u23",name:"沈亦航",campus:"杭州大学城",categories:["竞赛组队","技能共学"],interests:["挑战杯项目匹配","数学建模竞赛组队"],availability:["周六 15:00","周日 10:00"],level:"入门",socialTags:["行动派","组队型"],profileTags:["挑战杯","数学建模","产品设计","编程"],trustRate:.95,distanceKm:2.8,lat:30.3031,lng:120.3693,avatar:"沈",roles:["产品设计","Python 编程"],verifiedSkills:["校创项目成员证明","原型作品集"],weeklyHours:9},
  {id:"u24",name:"陆明远",campus:"杭州大学城",categories:["工程竞赛","竞赛组队"],interests:["全国大学生电子设计竞赛","智能机器人创新赛","人工智能算法挑战赛"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["目标感","行动派"],profileTags:["电子设计","机器人","人工智能","自动化","编程"],trustRate:.98,distanceKm:1.4,lat:30.3096,lng:120.3552,avatar:"陆",roles:["电路设计","嵌入式开发","硬件调试","机器人控制","算法开发"],verifiedSkills:["电子设计课程作品","机器人项目代码仓库"],weeklyHours:14},
  {id:"u25",name:"吴晴川",campus:"杭州大学城",categories:["商科竞赛","竞赛组队"],interests:["全国大学生市场调查与分析大赛","全国大学生物流设计大赛","互联网+创新创业项目"],availability:["周六 15:00","周日 10:00"],level:"进阶",socialTags:["目标感","表达型"],profileTags:["市场调研","供应链","商赛","商业案例","创新创业","路演"],trustRate:.97,distanceKm:1.9,lat:30.3147,lng:120.3499,avatar:"吴",roles:["问卷设计","市场调研","供应链分析","商业策划","路演表达"],verifiedSkills:["调研报告作品","商赛参赛证明"],weeklyHours:11},
  {id:"u26",name:"顾若岚",campus:"杭州大学城",categories:["创意竞赛","竞赛组队"],interests:["全国大学生广告艺术大赛","中国大学生计算机设计大赛","互联网+创新创业项目"],availability:["周六 19:00","周日 10:00"],level:"进阶",socialTags:["创作型","表达型"],profileTags:["创意设计","视觉设计","vlog生活家","P图大师","产品设计"],trustRate:.96,distanceKm:2.1,lat:30.3062,lng:120.3467,avatar:"顾",roles:["视觉设计","文案策划","短视频剪辑","前端开发","产品设计"],verifiedSkills:["作品集链接","设计赛事证明"],weeklyHours:10},
  {id:"u27",name:"赵观澜",campus:"杭州大学城",categories:["创意竞赛","竞赛组队"],interests:["英语演讲与辩论赛","跨文化翻译实践项目"],availability:["周六 15:00","周六 19:00","周日 10:00"],level:"进阶",socialTags:["表达型","组队型"],profileTags:["英语","翻译","语言艺术家","辩论","外语"],trustRate:.98,distanceKm:1.6,lat:30.3163,lng:120.3599,avatar:"赵",roles:["英语写作","口语表达","演讲主持","辩论论证","翻译校对","跨文化研究"],verifiedSkills:["英语竞赛证书","翻译作品节选"],weeklyHours:9},
  {id:"u28",name:"周谨言",campus:"杭州大学城",categories:["科研协作","竞赛组队"],interests:["大学生节能减排社会实践赛","社会调研与公益创新项目","科研论文共创小组"],availability:["周六 15:00","周日 10:00"],level:"进阶",socialTags:["目标感","慢热"],profileTags:["环保公益","社会调研","科研","论文写作","数据分析"],trustRate:.99,distanceKm:1.2,lat:30.3184,lng:120.3501,avatar:"周",roles:["社会调研","方案设计","报告撰写","文献检索","论文写作"],verifiedSkills:["社会实践证明","研究报告节选"],weeklyHours:12},
  {id:"u29",name:"李智恒",campus:"杭州大学城",categories:["工程竞赛","竞赛组队"],interests:["大数据分析创新赛","中国大学生计算机设计大赛","人工智能算法挑战赛"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["目标感","行动派"],profileTags:["大数据","人工智能","算法","数码发烧友","编程"],trustRate:.97,distanceKm:2.4,lat:30.3019,lng:120.3627,avatar:"李",roles:["数据分析","数据建模","Python 编程","模型调优","前端开发"],verifiedSkills:["数据分析项目","GitHub 代码仓库"],weeklyHours:13},
  {id:"u30",name:"沈予安",campus:"杭州大学城",categories:["工程竞赛","竞赛组队"],interests:["全国大学生智能汽车竞赛","全国大学生物流设计大赛","智能机器人创新赛"],availability:["周六 15:00","周日 10:00"],level:"入门",socialTags:["行动派","组队型"],profileTags:["智能汽车","机械设计","硬件","机器人","供应链"],trustRate:.95,distanceKm:2.6,lat:30.3042,lng:120.3418,avatar:"沈",roles:["机械设计","硬件调试","嵌入式开发","结构设计","项目管理"],verifiedSkills:["工程制图作品","硬件调试记录"],weeklyHours:9},
  {id:"u31",name:"叶霁",campus:"杭州大学城",categories:["科研协作","竞赛组队"],interests:["科研论文共创小组","大学生节能减排社会实践赛","社会调研与公益创新项目"],availability:["周六 19:00","周日 10:00"],level:"进阶",socialTags:["慢热","目标感"],profileTags:["科研","论文写作","理科生","实验","环保公益"],trustRate:.98,distanceKm:1.8,lat:30.3117,lng:120.3651,avatar:"叶",roles:["实验设计","文献检索","数据分析","论文写作","项目运营"],verifiedSkills:["实验课程成果","论文写作样本"],weeklyHours:11},
];

const haversineKm = (a:{lat:number;lng:number}, b:{lat:number;lng:number}) => {
  const r = 6371;
  const rad = (value:number) => value * Math.PI / 180;
  const dLat = rad(b.lat-a.lat);
  const dLng = rad(b.lng-a.lng);
  const value = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
  return r * 2 * Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
};

const levelScore = (requested: string, candidate: MatchLevel) => {
  if (requested.includes(candidate)) return 12;
  if (requested.includes("新手") && candidate === "入门") return 9;
  if (requested.includes("同水平")) return candidate === "入门" ? 12 : 7;
  return 6;
};

export function scoreCandidate(request: MatchRequest, candidate: MatchCandidate): ScoredCandidate {
  const distanceKm = request.location ? haversineKm(request.location, candidate) : candidate.distanceKm;
  let score = 0;
  const reasons: string[] = [];

  if (candidate.campus === request.campus) { score += 25; reasons.push("同校身份"); }
  if (candidate.interests.includes(request.activity)) { score += 28; reasons.push("同活动兴趣"); }
  else if (candidate.categories.includes(request.category)) { score += 18; reasons.push("同类兴趣"); }
  if (candidate.availability.includes(request.time)) { score += 20; reasons.push("时间一致"); }
  const fit = levelScore(request.level, candidate.level);
  score += fit;
  if (fit >= 9) reasons.push("水平接近");
  const socialOverlap = candidate.socialTags.filter(tag=>request.personalityTags.includes(tag)).length;
  if (socialOverlap) { score += Math.min(8, socialOverlap * 4); reasons.push("相处偏好相近"); }
  const tagHits = semanticOverlap(request.personalTags || [], candidate.profileTags || []);
  if (tagHits.length) { score += Math.min(18, tagHits.length * 6); reasons.push(`同频标签：${tagHits.slice(0,2).join("、")}`); }
  score += Math.round(candidate.trustRate * 7);
  if (candidate.trustRate >= .95) reasons.push("高守约率");
  if (distanceKm <= 2) { score += 5; reasons.push("距离较近"); }
  if (request.requiredRole && candidate.roles?.includes(request.requiredRole)) { score += 22; reasons.push("角色能力匹配"); }
  if (request.requiresVerifiedSkill && candidate.verifiedSkills?.length) { score += 12; reasons.push("能力材料已核验"); }
  if (request.requiresVerifiedSkill && (candidate.weeklyHours || 0) >= 8) { score += 6; reasons.push("投入时间达标"); }

  return {...candidate, distanceKm, score: Math.min(100, score), reasons};
}

export function matchUsers(request: MatchRequest, pool = demoCandidates): MatchPlan {
  const ranked = pool
    .filter(candidate=>candidate.trustRate >= .88)
    .filter(candidate=>!request.requiresVerifiedSkill || Boolean(candidate.verifiedSkills?.length && (candidate.weeklyHours || 0) >= 6))
    .map(candidate=>scoreCandidate(request, candidate))
    .sort((a,b)=>b.score-a.score || b.trustRate-a.trustRate);
  const selected = ranked.slice(0, Math.max(1, request.seats - 1));
  // 候补池要明显大于成局所需人数；多人拒绝或超时后仍能自动递补。
  const backups = ranked.slice(Math.max(1, request.seats - 1), Math.max(1, request.seats - 1) + 6);
  const averageScore = selected.length ? Math.round(selected.reduce((sum,user)=>sum+user.score,0)/selected.length) : 0;

  return {
    selected,
    backups,
    averageScore,
    factors:["同校身份","活动/品类兴趣","可用时间","水平目标","同频标签语义","守约与距离",...(request.requiresVerifiedSkill?["能力材料核验","项目角色匹配","投入时间"]:[])],
  };
}
