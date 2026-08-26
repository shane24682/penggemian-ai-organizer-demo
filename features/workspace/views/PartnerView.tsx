type PartnerViewProps = {
  partner: string;
  onPartnerChange: (partner: string) => void;
  onNotify: (message: string) => void;
};

const partnerCopy = {
  学生社团: { title: "把一次招新，变成持续活动供给", description: "乐器社、舞蹈社、摄影社等获得认证主页；AI处理报名、收费、候补、签到和复盘。", mark: "乐", name: "杭城大学吉他社", event: "零基础吉他合奏体验" },
  校园墙: { title: "从发布信息，升级为可报名的校园频道", description: "帖子可一键转为结构化活动卡，按学校分发并追踪报名与到场。", mark: "墙", name: "杭城大学校园墙", event: "周五校园露天电影夜" },
  场地商家: { title: "把空闲场地，变成稳定的学生订单", description: "台球厅、桌游店、影院和球馆可发布校园时段，自动拼场。", mark: "店", name: "南门青年台球俱乐部", event: "台球新手四人练习局" },
} as const;

export default function PartnerView({ partner, onPartnerChange, onNotify }: PartnerViewProps) {
  const copy = partnerCopy[partner as keyof typeof partnerCopy] || partnerCopy.学生社团;
  return <div className="workspace-view embedded-view partner-view">
    <div className="view-heading"><div><span>CAMPUS PARTNER NETWORK</span><h2>机构接入</h2><p>社团、校园墙和场地商家接入同一个活动网络。</p></div></div>
    <div className="partner-shell">
      <div className="partner-tabs">{Object.keys(partnerCopy).map(name => <button className={partner === name ? "active" : ""} key={name} onClick={() => onPartnerChange(name)}>{name}</button>)}</div>
      <div className="partner-content">
        <div className="partner-copy"><span className="partner-type">{partner}接入空间</span><h3>{copy.title}</h3><p>{copy.description}</p><div className="partner-benefits"><span>✓ 认证主页</span><span>✓ 一键分发</span><span>✓ 候补签到</span><span>✓ 收益结算</span></div><button onClick={() => onNotify(`${partner}接入申请 Demo 已提交`)}>申请接入 →</button></div>
        <div className="org-preview"><div className="org-head"><span>{copy.mark}</span><div><b>{copy.name}</b><p>负责人已认证 · 本校可见</p></div><em>已接入</em></div><div className="org-stats"><div><b>1,286</b><span>关注学生</span></div><div><b>32</b><span>已完成活动</span></div><div><b>91%</b><span>平均到场率</span></div></div><div className="org-event"><span>本周活动</span><b>{copy.event}</b><p>AI已完成场地、规则和报名配置</p><button onClick={() => onNotify("已加入活动候补名单")}>查看并报名</button></div></div>
      </div>
    </div>
  </div>;
}
