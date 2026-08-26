import Icon from "@/components/Icon";
import type { HistoryRecord } from "../types";

type HistoryViewProps = {
  records: HistoryRecord[];
  onOpenActivity: (activity?: string) => void;
};

export default function HistoryView({ records, onOpenActivity }: HistoryViewProps) {
  return <div className="workspace-view embedded-view history-view">
    <div className="view-heading"><div><span>MY ACTIVITY LEDGER</span><h2>过往活动记录</h2><p>这里读取的是你在当前 Demo 中真实完成的成局记录，不是预置展示卡片。</p></div><b>{records.length}<small>条本机记录</small></b></div>
    {records.length ? <div className="history-list">{records.map(record => <article key={record.id}>
      <div className="history-icon"><Icon name="check" size="md"/></div>
      <div><span>{new Date(record.createdAt).toLocaleString("zh-CN")}</span><h3>{record.activity}</h3><p>{record.time} · {record.venue}</p></div>
      <div className="history-meta">
        <b>{record.scene && record.scene !== "offline" ? "免费" : <>¥{record.totalPerPerson ?? record.price ?? 0}/人</>}</b>
        <small>{record.scene && record.scene !== "offline" ? record.scene === "online" ? "临时线上房间" : "项目协作空间" : record.venueFeePerPerson !== undefined ? <>场地 ¥{record.venueFeePerPerson} + AI ¥{record.aiServiceFee}</> : "旧版费用记录"}</small>
        <em>{record.status}</em><small>{record.calendarAdded ? "已导入日历" : "未导入日历"}</small>
      </div>
      <button onClick={() => onOpenActivity(record.activity)}>再次发起 →</button>
    </article>)}</div> : <div className="history-empty"><span>↺</span><h3>还没有真实活动记录</h3><p>完成一次“确认并开始碰面”的 Demo 流程后，记录会立即写入并可在这里查询。</p><button onClick={() => onOpenActivity()}>开始第一次匹配 →</button></div>}
    <div className="storage-note"><b>记录机制</b><p>当前版本未要求登录，因此记录保存在本设备浏览器中；接入校园账号后可替换为云端数据库，实现跨设备查询。</p></div>
  </div>;
}
