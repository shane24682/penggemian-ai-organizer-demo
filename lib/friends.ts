export type FriendProfile = {
  id: string;
  nickname: string;
  school: string;
  major: string;
  grade: string;
  avatar: string;
  tags: string[];
  mutual: number;
  lastActive: string;
};

export const friendDirectory: FriendProfile[] = [
  {id:"PG10086",nickname:"林一帆",school:"杭城大学",major:"计算机科学",grade:"大三",avatar:"林",tags:["羽毛球","摄影","桌游"],mutual:4,lastActive:"刚刚活跃"},
  {id:"PG20247",nickname:"周小满",school:"杭城大学",major:"视觉传达",grade:"大二",avatar:"周",tags:["街拍","陶艺","Citywalk"],mutual:2,lastActive:"10分钟前"},
  {id:"PG31415",nickname:"陈默",school:"杭城大学",major:"金融学",grade:"大三",avatar:"陈",tags:["篮球","剧本杀","咖啡"],mutual:7,lastActive:"今天活跃"},
  {id:"PG52020",nickname:"许知夏",school:"杭城大学",major:"英语",grade:"大二",avatar:"许",tags:["外语角","电影","乐队"],mutual:3,lastActive:"今天活跃"},
  {id:"PG66218",nickname:"孟可",school:"杭城大学",major:"新闻传播",grade:"大三",avatar:"孟",tags:["Vlog","辩论","露营"],mutual:1,lastActive:"昨天活跃"},
  {id:"PG77889",nickname:"赵同学",school:"杭城大学",major:"工业设计",grade:"大二",avatar:"赵",tags:["飞盘","手作","Switch"],mutual:5,lastActive:"30分钟前"},
  {id:"PG88001",nickname:"宋野",school:"杭州理工学院",major:"建筑学",grade:"大三",avatar:"宋",tags:["攀岩","徒步","摄影"],mutual:0,lastActive:"今天活跃"},
  {id:"PG99072",nickname:"叶安",school:"杭城大学",major:"应用心理",grade:"大二",avatar:"叶",tags:["读书会","桌游","猫猫"],mutual:6,lastActive:"1小时前"},
];

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "");

export function searchFriends(query: string, directory: FriendProfile[] = friendDirectory) {
  const term = normalize(query);
  if (!term) return directory.slice(0, 5);
  return directory
    .map(profile => {
      const id = normalize(profile.id);
      const nickname = normalize(profile.nickname);
      const searchable = normalize([profile.school, profile.major, profile.grade, ...profile.tags].join(" "));
      const score = id === term ? 120 : id.includes(term) ? 90 : nickname === term ? 100 : nickname.includes(term) ? 75 : searchable.includes(term) ? 45 : 0;
      return {profile, score};
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || b.profile.mutual - a.profile.mutual)
    .map(result => result.profile)
    .slice(0, 8);
}
