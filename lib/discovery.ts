export type SearchableActivity = {
  name: string;
  category: string;
  group: string;
  note: string;
  aliases?: string[];
};

export const semanticGroups: Record<string, string[]> = {
  摄影: ["拍照", "约拍", "街拍", "相机", "胶片", "写真", "vlog", "短视频", "P图", "修图"],
  运动: ["健身达人", "体育生", "有腹肌", "打球", "对打", "球友", "羽球", "篮球", "乒乓", "台球", "桌球", "斯诺克", "运动"],
  桌游: ["棋牌", "麻将", "狼人杀", "剧本杀", "推理", "密室", "聚会游戏"],
  电影: ["观影", "影院", "看电影", "映后", "电影搭子", "影迷"],
  户外: ["徒步", "爬山", "露营", "骑行", "citywalk", "散步", "郊游", "旅行"],
  音乐: ["乐器", "唱歌", "合唱", "吉他", "乐队", "声乐", "K歌", "弹唱"],
  学习: ["自习", "读书", "考研", "面试", "简历", "ppt", "技能", "学霸"],
  商科竞赛: ["商业案例", "案例大赛", "商赛", "case", "咨询", "挑战杯", "创新创业", "路演", "行业研究", "金融", "财管", "CPA"],
  技术竞赛: ["数学建模", "建模", "ACM", "算法", "刷题", "编程", "代码", "leetcode", "github"],
  手作: ["diy", "陶艺", "手工", "烘焙", "插花", "拼豆", "咖啡"],
  游戏: ["电竞", "开黑", "switch", "ps5", "网吧", "电玩", "steam", "王者", "瓦", "valorant", "lol", "原神"],
  科技: ["数码", "编程", "代码", "web3", "赛博", "github", "算法"],
  社交: ["树洞", "社恐", "i人", "e人", "慢热", "梗", "咖啡", "扩列", "聊天"],
};

const normalize = (value: string) => value.toLowerCase().replace(/[\s,，。.!！?？、/_-]/g, "");

export function expandSemanticTerms(values: string[] | string) {
  const initial = Array.isArray(values) ? values : [values];
  const terms = new Set(initial.map(normalize).filter(Boolean));
  Object.entries(semanticGroups).forEach(([topic, aliases]) => {
    const normalizedTopic = normalize(topic);
    if ([...terms].some(current=>current.includes(normalizedTopic) || normalizedTopic.includes(current)) || aliases.some(alias => [...terms].some(current=>current.includes(normalize(alias)) || normalize(alias).includes(current)))) {
      terms.add(normalizedTopic);
      aliases.forEach(alias => terms.add(normalize(alias)));
    }
  });
  return [...terms];
}

export function semanticOverlap(left: string[], right: string[]) {
  const a = expandSemanticTerms(left);
  const b = expandSemanticTerms(right);
  return Array.from(new Set(a.filter(term=>b.some(other=>term===other || term.includes(other) || other.includes(term)))));
}

export function searchActivities<T extends SearchableActivity>(query: string, activities: T[], profileTags: string[] = []): Array<T & { searchScore: number; matchedBy: string }> {
  if (!query.trim()) return [];
  const terms = expandSemanticTerms(query);
  return activities.map(activity => {
    const name = normalize(activity.name);
    const category = normalize(activity.category);
    const group = normalize(activity.group);
    const note = normalize(activity.note);
    const aliases = (activity.aliases || []).map(normalize);
    const profileHits = semanticOverlap(profileTags, [activity.name, activity.category, activity.group, activity.note, ...(activity.aliases || [])]);
    let score = profileHits.length * 7;
    let matchedBy = profileHits.length ? `个性化推荐 · ${profileHits.slice(0,2).join("、")}` : "相关活动";

    terms.forEach(term => {
      if (name === term) { score += 120; matchedBy = "活动名称完全匹配"; }
      else if (name.includes(term) || term.includes(name)) { score += 72; matchedBy = "活动名称匹配"; }
      if (aliases.some(alias => alias.includes(term) || term.includes(alias))) { score += 56; matchedBy = `近义语义匹配 · ${profileHits.slice(0,2).join("、") || term}`; }
      if (group.includes(term)) { score += 34; matchedBy = "玩法类型匹配"; }
      if (category.includes(term)) score += 22;
      if (note.includes(term)) score += 12;
    });

    return {...activity, searchScore: score, matchedBy};
  }).filter(activity => activity.searchScore > 0).sort((a, b) => b.searchScore - a.searchScore).slice(0, 8);
}

export function rankActivitiesForProfile<T extends SearchableActivity>(activities: T[], profileTags: string[], seed = 0) {
  // “个性化推荐”只返回与用户标签确实存在语义命中的项目。
  // 不能因为随机轮换，让无关的商赛/证书项目混入标签推荐。
  return activities.map(activity => {
    const hits = semanticOverlap(profileTags, [activity.name, activity.category, activity.group, activity.note, ...(activity.aliases || [])]);
    const stable = [...`${activity.name}${seed}`].reduce((sum,char)=>sum+char.charCodeAt(0),0)%11;
    return hits.length ? {...activity, personalScore:hits.length*24+stable, profileReason:`因为你标记了 ${hits.slice(0,3).join("、")}`} : null;
  }).filter((activity): activity is T & { personalScore:number; profileReason:string } => Boolean(activity)).sort((a,b)=>b.personalScore-a.personalScore);
}
