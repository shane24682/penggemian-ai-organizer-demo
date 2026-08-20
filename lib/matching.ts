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
  {id:"u01",name:"林小满",campus:"杭州大学城",categories:["运动","户外探索"],interests:["羽毛球双打","校园夜跑打卡","登山徒步"],availability:["周六 15:00","周日 10:00"],level:"入门",socialTags:["轻社交","行动派"],trustRate:.98,distanceKm:1.2,lat:30.3108,lng:120.3524,avatar:"林"},
  {id:"u02",name:"周屿",campus:"杭州大学城",categories:["运动","轻娱乐"],interests:["篮球3V3","台球斯诺克","Switch派对游戏"],availability:["周六 15:00","周六 19:00"],level:"入门",socialTags:["组队型","热闹"],trustRate:.96,distanceKm:2.1,lat:30.3066,lng:120.3658,avatar:"周"},
  {id:"u03",name:"孟然",campus:"杭州大学城",categories:["兴趣技能","社团社交"],interests:["城市街拍约拍","咖啡拉花体验","外语角"],availability:["周六 15:00","周日 10:00"],level:"新手",socialTags:["慢热","创作型"],trustRate:1,distanceKm:.8,lat:30.3182,lng:120.3471,avatar:"孟"},
  {id:"u04",name:"陈一禾",campus:"杭州大学城",categories:["运动","学习充电"],interests:["飞盘争夺赛","圆桌读书会","模拟面试官"],availability:["周六 15:00","周六 19:00"],level:"入门",socialTags:["行动派","目标感"],trustRate:.94,distanceKm:1.8,lat:30.3017,lng:120.3581,avatar:"陈"},
  {id:"u05",name:"许诺",campus:"杭州大学城",categories:["轻娱乐","兴趣技能"],interests:["剧本杀","陶艺拉坯","乐队合奏"],availability:["周六 19:00","周日 10:00"],level:"新手",socialTags:["沉浸型","创作型"],trustRate:.97,distanceKm:2.4,lat:30.3139,lng:120.3398,avatar:"许"},
  {id:"u06",name:"赵今安",campus:"杭州大学城",categories:["轻娱乐","社团社交"],interests:["麻将三缺一","狼人杀","深夜夜聊茶话会"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["热闹","组队型"],trustRate:.92,distanceKm:1.1,lat:30.3081,lng:120.3492,avatar:"赵"},
  {id:"u07",name:"唐梨",campus:"杭州大学城",categories:["兴趣技能","户外探索"],interests:["Vlog创作","油菜花田写生","Citywalk人文历史路线"],availability:["周六 15:00","周日 10:00"],level:"入门",socialTags:["创作型","探索欲"],trustRate:.99,distanceKm:1.6,lat:30.3188,lng:120.3612,avatar:"唐"},
  {id:"u08",name:"顾言",campus:"杭州大学城",categories:["学习充电","社团社交"],interests:["奇葩说式辩论赛","TEDx观影会","方言趣味教学"],availability:["周六 19:00","周日 10:00"],level:"进阶",socialTags:["表达型","目标感"],trustRate:.95,distanceKm:2.9,lat:30.2998,lng:120.3433,avatar:"顾"},
  {id:"u09",name:"沈知夏",campus:"杭州大学城",categories:["运动","户外探索"],interests:["匹克球体验","环湖骑行","露营烧烤"],availability:["周六 15:00","周日 10:00"],level:"新手",socialTags:["行动派","探索欲"],trustRate:.93,distanceKm:3.2,lat:30.2928,lng:120.3740,avatar:"沈"},
  {id:"u10",name:"陆川",campus:"杭州大学城",categories:["轻娱乐","运动"],interests:["网吧5V5开黑","篮球3V3","保龄球"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["竞技型","组队型"],trustRate:.9,distanceKm:2.7,lat:30.3041,lng:120.3308,avatar:"陆"},
  {id:"u11",name:"苏木",campus:"杭州大学城",categories:["兴趣技能","学习充电"],interests:["尤克里里速成课","手机短视频剪辑","PPT设计工坊"],availability:["周六 15:00","周日 10:00"],level:"新手",socialTags:["慢热","创作型"],trustRate:.98,distanceKm:1.4,lat:30.3210,lng:120.3530,avatar:"苏"},
  {id:"u12",name:"韩冬",campus:"杭州大学城",categories:["社团社交","户外探索"],interests:["动漫Cosplay外拍","寻找城市地标打卡","电竞赛事集体观赛"],availability:["周六 19:00","周日 10:00"],level:"入门",socialTags:["同好型","探索欲"],trustRate:.96,distanceKm:2,lat:30.3074,lng:120.3722,avatar:"韩"},
  {id:"u13",name:"程予安",campus:"杭州大学城",categories:["竞赛组队","技能共学"],interests:["数学建模竞赛组队","ACM 算法刷题小组"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["目标感","行动派"],trustRate:.98,distanceKm:1.5,lat:30.3134,lng:120.3512,avatar:"程",roles:["Python 编程","建模求解"],verifiedSkills:["算法训练营结业","GitHub 作品集"],weeklyHours:12},
  {id:"u14",name:"顾思齐",campus:"杭州大学城",categories:["竞赛组队","证书共学"],interests:["数学建模竞赛组队","CPA 财管晚间共学"],availability:["周六 19:00","周日 10:00"],level:"进阶",socialTags:["表达型","目标感"],trustRate:.97,distanceKm:2.2,lat:30.3072,lng:120.3577,avatar:"顾",roles:["论文写作","数据分析"],verifiedSkills:["建模校赛参赛证明","课程成绩单"],weeklyHours:10},
  {id:"u15",name:"叶知行",campus:"杭州大学城",categories:["竞赛组队","长期共学"],interests:["商业案例大赛组队","挑战杯项目匹配"],availability:["周六 15:00","周日 10:00"],level:"入门",socialTags:["组队型","目标感"],trustRate:.96,distanceKm:1.9,lat:30.3105,lng:120.3435,avatar:"叶",roles:["行业研究","路演表达"],verifiedSkills:["咨询社案例作品","演讲比赛证书"],weeklyHours:8},
  {id:"u16",name:"宋念",campus:"杭州大学城",categories:["证书共学","长期共学"],interests:["CPA 财管晚间共学","考研监督自习组"],availability:["周六 19:00","周日 10:00"],level:"进阶",socialTags:["目标感","慢热"],trustRate:.99,distanceKm:1.1,lat:30.3153,lng:120.3498,avatar:"宋",roles:["CPA 财管","打卡监督"],verifiedSkills:["CPA 已过科目证明","学习计划"],weeklyHours:14},
  {id:"u17",name:"陆言",campus:"杭州大学城",categories:["竞赛组队","技能共学"],interests:["商业案例大赛组队","挑战杯项目匹配"],availability:["周六 15:00","周六 19:00"],level:"进阶",socialTags:["行动派","表达型"],trustRate:.95,distanceKm:2.5,lat:30.3048,lng:120.3612,avatar:"陆",roles:["产品设计","项目运营"],verifiedSkills:["产品作品集","校级创新项目成员证明"],weeklyHours:9},
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
  const backups = ranked.slice(Math.max(1, request.seats - 1), Math.max(1, request.seats - 1) + 2);
  const averageScore = selected.length ? Math.round(selected.reduce((sum,user)=>sum+user.score,0)/selected.length) : 0;

  return {
    selected,
    backups,
    averageScore,
    factors:["同校身份","活动/品类兴趣","可用时间","水平目标","相处偏好","守约与距离",...(request.requiresVerifiedSkill?["能力材料核验","项目角色匹配","投入时间"]:[])],
  };
}
