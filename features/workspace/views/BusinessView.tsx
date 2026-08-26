type BusinessViewProps = { onNotify: (message: string) => void };

export default function BusinessView({ onNotify }: BusinessViewProps) {
  return <div className="workspace-view embedded-view business-view">
    <div className="view-heading"><div><span>FOR BRAND & VENUE</span><h2>品牌合作</h2><p>按真实到场、商品体验与成交结果获得校园增长。</p></div></div>
    <div className="business-dashboard">
      <div><h3>每次成局，都是一次真实消费。</h3><p>报名、场地、物资与天猫商品在同一订单链路中完成。</p><div className="stats"><div><b>同校</b><span>身份已核验</span></div><div><b>守约率</b><span>活动后沉淀</span></div><div><b>全链路</b><span>报名至核销</span></div></div><button onClick={() => onNotify("合作方案：按到场、核销或成交结算")}>查看合作方案 →</button></div>
      <div className="funnel-card"><div className="funnel-head"><div><span className="brand-dot">N</span><div><b>运动品牌校园体验局</b><p>演示数据 · 杭州 · 5所高校</p></div></div><em>模拟看板</em></div><div className="metric-row"><div><span>活动场次</span><b>24</b></div><div><span>真实到场</span><b>386</b></div><div><span>天猫成交</span><b>¥28.6k</b></div></div><div className="bars"><span style={{height: "48%"}}/><span style={{height: "68%"}}/><span style={{height: "60%"}}/><span style={{height: "87%"}}/><span style={{height: "72%"}}/><span style={{height: "94%"}}/></div></div>
    </div>
  </div>;
}
