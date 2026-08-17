export type MbtiAxis = "EI" | "SN" | "TF" | "JP";

export type MbtiAnswer = {
  label: string;
  value: -2 | -1 | 1 | 2;
};

export type MbtiQuestion = {
  axis: MbtiAxis;
  question: string;
  left: string;
  right: string;
  answers: [MbtiAnswer, MbtiAnswer, MbtiAnswer, MbtiAnswer];
};

const options = (left: string, right: string): [MbtiAnswer, MbtiAnswer, MbtiAnswer, MbtiAnswer] => [
  { label: `很像我：${left}`, value: -2 },
  { label: `更偏向：${left}`, value: -1 },
  { label: `更偏向：${right}`, value: 1 },
  { label: `很像我：${right}`, value: 2 },
];

export const mbtiQuestions: MbtiQuestion[] = [
  { axis: "EI", question: "进入一个全是新同学的活动时，你通常会？", left: "先主动认识几个人", right: "先观察，等自然聊起来", answers: options("主动开场", "慢慢进入状态") },
  { axis: "SN", question: "决定参加活动时，什么最打动你？", left: "流程、时间和收获都很清楚", right: "玩法新鲜，有意想不到的可能", answers: options("具体可预期", "新鲜有想象力") },
  { axis: "TF", question: "小组临时出现分歧时，你更自然的反应是？", left: "找最有效率、最公平的方案", right: "先照顾大家感受再协调", answers: options("按逻辑解决", "按感受协调") },
  { axis: "JP", question: "周末活动的安排方式，你更喜欢？", left: "提前确定时间地点和规则", right: "保留弹性，到时候看状态", answers: options("计划确定", "灵活随性") },
  { axis: "EI", question: "一次活动结束后，你更可能？", left: "继续约下一场或拉群聊天", right: "先独处恢复，再决定是否联系", answers: options("继续互动", "安静恢复") },
  { axis: "SN", question: "学习一个新技能时，你更喜欢？", left: "先看示范，照步骤马上练", right: "先理解原理，再探索自己的方法", answers: options("步骤和实操", "原理和可能性") },
  { axis: "TF", question: "挑选队友时，你更看重？", left: "能力、守时和目标一致", right: "相处舒服、愿意互相照顾", answers: options("可靠有效", "友善合拍") },
  { axis: "JP", question: "活动临时更换场地，你通常会？", left: "希望立刻重新确认所有细节", right: "问题不大，跟着变化调整", answers: options("重新确定", "随机应变") },
  { axis: "EI", question: "多人活动中，你获得能量的方式更像？", left: "和不同的人快速互动", right: "和少数同频的人深入交流", answers: options("广泛互动", "少数深聊") },
  { axis: "SN", question: "浏览活动广场时，你更容易点开？", left: "明确写着人数、费用、成果的活动", right: "主题特别、以前没试过的活动", answers: options("明确实用", "特别未知") },
  { axis: "TF", question: "AI推荐了匹配度高但性格不同的队友，你会？", left: "看数据合理就愿意尝试", right: "更在意第一感觉是否舒服", answers: options("相信依据", "相信感受") },
  { axis: "JP", question: "你理想中的AI主理人应该？", left: "把每个节点都提前安排好", right: "只处理麻烦事，给我更多自由", answers: options("完整规划", "留出自由") },
];

export type MbtiResult = {
  type: string;
  title: string;
  description: string;
  tags: string[];
  axes: Array<{ axis: MbtiAxis; left: string; right: string; score: number; letter: string }>;
};

const typeCopy: Record<string, { title: string; description: string; tags: string[] }> = {
  INTJ: { title: "独立策划者", description: "喜欢目标清晰、组织高效的小组，在有准备的探索中更容易投入。", tags: ["目标感", "慢热", "探索欲"] },
  INTP: { title: "好奇研究者", description: "对新玩法和有趣问题敏感，适合低压力、能自由探索的活动。", tags: ["慢热", "探索欲", "创作型"] },
  ENTJ: { title: "行动组织者", description: "擅长推动事情发生，喜欢目标明确、节奏利落的团队活动。", tags: ["行动派", "目标感", "组队型"] },
  ENTP: { title: "灵感发起人", description: "享受新鲜体验和观点碰撞，常常能让一群陌生人快速热起来。", tags: ["探索欲", "表达型", "热闹"] },
  INFJ: { title: "共鸣连接者", description: "重视活动意义和深度连接，更适合有共同主题的小规模活动。", tags: ["同好型", "慢热", "目标感"] },
  INFP: { title: "温柔体验家", description: "看重真实感受和自由表达，在创作、自然与同好活动中更自在。", tags: ["创作型", "轻社交", "探索欲"] },
  ENFJ: { title: "氛围主理人", description: "善于照顾团队感受，也愿意主动让每个人融入活动。", tags: ["组队型", "表达型", "同好型"] },
  ENFP: { title: "活力探索家", description: "容易被新鲜的人和事点燃，适合轻松、开放、变化丰富的活动。", tags: ["热闹", "探索欲", "创作型"] },
  ISTJ: { title: "可靠执行者", description: "重视规则、守时和确定性，是稳定复组和长期小组的理想成员。", tags: ["目标感", "行动派", "轻社交"] },
  ISFJ: { title: "贴心同行者", description: "喜欢熟悉、安全、有照顾感的活动氛围，更容易在固定小组中建立关系。", tags: ["轻社交", "同好型", "慢热"] },
  ESTJ: { title: "高效队长", description: "愿意承担责任并推进进度，适合竞技、协作和明确分工的活动。", tags: ["行动派", "组队型", "目标感"] },
  ESFJ: { title: "热情召集人", description: "享受一起参与和互相回应，擅长把一次活动变成熟人局。", tags: ["热闹", "组队型", "同好型"] },
  ISTP: { title: "冷静玩家", description: "喜欢直接上手、边做边学，在技能、竞技和户外体验中进入状态。", tags: ["行动派", "轻社交", "探索欲"] },
  ISFP: { title: "自在创作者", description: "重视当下体验和审美表达，适合低压力的手作、摄影和自然活动。", tags: ["创作型", "轻社交", "慢热"] },
  ESTP: { title: "现场玩家", description: "反应快、敢尝试，越是有互动、有挑战的活动越容易投入。", tags: ["行动派", "热闹", "探索欲"] },
  ESFP: { title: "快乐气氛组", description: "喜欢即时互动和共同体验，能让活动现场自然产生连接。", tags: ["热闹", "组队型", "轻社交"] },
};

export function calculateMbti(answers: number[]): MbtiResult {
  const scores: Record<MbtiAxis, number> = { EI: 0, SN: 0, TF: 0, JP: 0 };
  answers.forEach((answerIndex, index) => {
    const question = mbtiQuestions[index];
    const answer = question?.answers[answerIndex];
    if (question && answer) scores[question.axis] += answer.value;
  });
  const dimensions: Array<[MbtiAxis, string, string]> = [["EI", "E", "I"], ["SN", "S", "N"], ["TF", "T", "F"], ["JP", "J", "P"]];
  const type = dimensions.map(([axis, left, right]) => scores[axis] <= 0 ? left : right).join("");
  const copy = typeCopy[type] || typeCopy.INFP;
  return {
    type,
    ...copy,
    axes: dimensions.map(([axis, left, right]) => ({ axis, left, right, score: scores[axis], letter: scores[axis] <= 0 ? left : right })),
  };
}
