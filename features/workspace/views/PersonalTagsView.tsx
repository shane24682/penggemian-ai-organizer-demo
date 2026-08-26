type PersonalTagsViewProps = {
  groups: string[][];
  selectedTags: string[];
  onToggle: (tag: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

const groupNames = ["性格与生活方式", "游戏与数码兴趣", "技能与内容偏好", "MBTI", "学习与竞赛目标"];

export default function PersonalTagsView({ groups, selectedTags, onToggle, onCancel, onSave }: PersonalTagsViewProps) {
  return <div className="workspace-view embedded-view tag-view">
    <div className="view-heading"><div><span>PERSONAL MATCH TAGS</span><h2>个人标签</h2><p>标签不公开展示；它们会扩展为近义语义，用于排序活动和筛选更适合一起参加的人。</p></div><b>{selectedTags.length}<small>已选择</small></b></div>
    <div className="tag-algorithm-note"><b>算法如何使用</b><span>标签 → 语义扩展（如“王者荣耀”→ MOBA / 开黑）→ 活动召回 → 同频候选人排序 → 分别发送邀请</span></div>
    <div className="tag-groups">{groups.map((group, index) => <section key={groupNames[index]}><small>{groupNames[index]}</small><div>{group.map(tag => <button key={tag} className={selectedTags.includes(tag) ? "selected" : ""} onClick={() => onToggle(tag)}>{selectedTags.includes(tag) ? "✓ " : "＋ "}{tag}</button>)}</div></section>)}</div>
    <div className="tag-actions"><button onClick={onCancel}>取消</button><button className="primary" onClick={onSave}>保存并查看推荐 →</button></div>
  </div>;
}
