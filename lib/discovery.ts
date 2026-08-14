export type SearchableActivity = {
  name: string;
  category: string;
  group: string;
  note: string;
  aliases?: string[];
};

const semanticGroups: Record<string, string[]> = {
  摄影: ["拍照", "约拍", "街拍", "相机", "胶片", "写真", "vlog", "短视频"],
  球类: ["打球", "对打", "球友", "羽球", "篮框", "乒乓", "台球", "桌球", "斯诺克"],
  桌游: ["棋牌", "麻将", "狼人杀", "剧本杀", "推理", "聚会游戏"],
  电影: ["观影", "影院", "看电影", "映后", "电影搭子"],
  户外: ["徒步", "爬山", "露营", "骑行", "citywalk", "散步", "郊游"],
  音乐: ["乐器", "唱歌", "合唱", "吉他", "乐队", "声乐"],
  学习: ["自习", "读书", "考研", "面试", "简历", "ppt", "技能"],
  手作: ["diy", "陶艺", "手工", "烘焙", "插花", "拼豆"],
  游戏: ["电竞", "开黑", "switch", "ps5", "网吧", "电玩"],
};

const normalize = (value: string) => value.toLowerCase().replace(/[\s,，。.!！?？、/_-]/g, "");

const expandedTerms = (query: string) => {
  const normalized = normalize(query);
  const terms = new Set([normalized]);
  Object.entries(semanticGroups).forEach(([topic, aliases]) => {
    const normalizedTopic = normalize(topic);
    if (normalized.includes(normalizedTopic) || aliases.some(alias => normalized.includes(normalize(alias)))) {
      terms.add(normalizedTopic);
      aliases.forEach(alias => terms.add(normalize(alias)));
    }
  });
  return [...terms].filter(Boolean);
};

export function searchActivities<T extends SearchableActivity>(query: string, activities: T[]): Array<T & { searchScore: number; matchedBy: string }> {
  if (!query.trim()) return [];
  const terms = expandedTerms(query);
  return activities.map(activity => {
    const name = normalize(activity.name);
    const category = normalize(activity.category);
    const group = normalize(activity.group);
    const note = normalize(activity.note);
    const aliases = (activity.aliases || []).map(normalize);
    let score = 0;
    let matchedBy = "相关活动";

    terms.forEach(term => {
      if (name === term) { score += 120; matchedBy = "活动名称完全匹配"; }
      else if (name.includes(term) || term.includes(name)) { score += 72; matchedBy = "活动名称匹配"; }
      if (aliases.some(alias => alias.includes(term) || term.includes(alias))) { score += 56; matchedBy = "近义语义匹配"; }
      if (group.includes(term)) { score += 34; matchedBy = "玩法类型匹配"; }
      if (category.includes(term)) score += 22;
      if (note.includes(term)) score += 12;
    });

    return {...activity, searchScore: score, matchedBy};
  }).filter(activity => activity.searchScore > 0).sort((a, b) => b.searchScore - a.searchScore).slice(0, 8);
}
