import Icon from "@/components/Icon";
import type { FriendProfile } from "@/lib/friends";
import type { VerificationStatus } from "../types";

type FriendsViewProps = {
  verificationStatus: VerificationStatus;
  scannedFriendId: string;
  query: string;
  results: FriendProfile[];
  friends: FriendProfile[];
  incomingFriends: FriendProfile[];
  friendIds: string[];
  outgoingIds: string[];
  incomingIds: string[];
  onQueryChange: (query: string) => void;
  onSendRequest: (id: string) => void;
  onAcceptRequest: (id: string) => void;
  onIgnoreRequest: (id: string) => void;
  onDismissScan: () => void;
  onOpenFriendCode: () => void;
  onCopyId: () => void;
  onOpenChat: (profile: FriendProfile) => void;
};

const verificationLabel = (status: VerificationStatus) => status === "verified" ? "已认证" : status === "reviewing" ? "审核中" : "未认证";

export default function FriendsView(props: FriendsViewProps) {
  const { verificationStatus, scannedFriendId, query, results, friends, incomingFriends, friendIds, outgoingIds, incomingIds } = props;
  return <div className="workspace-view embedded-view friends-view">
    <div className="view-heading"><div><span>CAMPUS FRIEND NETWORK</span><h2>好友</h2><p>按碰个面 ID、昵称或二维码找到同校同学，发出好友申请。</p></div><b>{friends.length}<small>位本机好友</small></b></div>
    {scannedFriendId && <div className="scanned-friend-banner">
      <span><Icon name="qr-code" size="md"/></span><div><b>好友码校验通过</b><p>识别到碰个面ID：{scannedFriendId}</p></div>
      {outgoingIds.includes(scannedFriendId) ? <button disabled>等待对方通过</button> : <button onClick={() => props.onSendRequest(scannedFriendId)}><Icon name="plus" size="sm"/>发送好友申请</button>}
      <button className="scan-dismiss" aria-label="关闭好友码提示" onClick={props.onDismissScan}><Icon name="x" size="sm"/></button>
    </div>}
    <div className="friend-identity">
      <div><span>Y</span><div><small>我的碰个面 ID</small><b>PG20260814</b><p>杭城大学 · 大学生认证状态：{verificationLabel(verificationStatus)}</p></div></div>
      <div className="friend-identity-actions"><button onClick={props.onOpenFriendCode}><Icon name="qr-code" size="sm"/>好友码 / 扫一扫</button><button onClick={props.onCopyId}>复制 ID</button></div>
    </div>
    <div className="friend-layout">
      <section className="friend-discovery">
        <div className="friend-search"><span><Icon name="search" size="sm"/></span><input value={query} onChange={event => props.onQueryChange(event.target.value)} placeholder="搜索好友 ID 或昵称，例如 PG10086、林一帆"/><button onClick={() => props.onQueryChange(query.trim())}>搜索</button></div>
        <div className="friend-result-head"><b>{query.trim() ? `“${query}”的搜索结果` : "可能认识的同学"}</b><span>{results.length} 人</span></div>
        {results.length ? <div className="friend-results">{results.map(profile => {
          const isFriend = friendIds.includes(profile.id);
          const isOutgoing = outgoingIds.includes(profile.id);
          const isIncoming = incomingIds.includes(profile.id);
          return <article key={profile.id}>
            <span className="friend-avatar">{profile.avatar}</span>
            <div className="friend-copy"><div><h3>{profile.nickname}</h3><em>{profile.id}</em></div><p>{profile.school} · {profile.grade} · {profile.major}</p><div>{profile.tags.map(tag => <small key={tag}>{tag}</small>)}</div><i>{profile.mutual ? `${profile.mutual} 位共同好友 · ` : ""}{profile.lastActive}</i></div>
            {isFriend ? <button className="friend-state" disabled>已是好友</button> : isIncoming ? <button className="friend-accept" onClick={() => props.onAcceptRequest(profile.id)}>同意申请</button> : isOutgoing ? <button className="friend-state" disabled>等待通过</button> : <button className="friend-add" onClick={() => props.onSendRequest(profile.id)}><Icon name="plus" size="sm"/>添加好友</button>}
          </article>;
        })}</div> : <div className="friend-empty"><span><Icon name="search" size="lg"/></span><h3>没有找到这个用户</h3><p>请检查完整 ID 或昵称是否正确；校园身份未完成的用户不会出现在搜索结果中。</p></div>}
      </section>
      <aside className="friend-side">
        {incomingFriends.length > 0 && <div className="friend-panel"><div className="friend-panel-title"><b>新的好友申请</b><span>{incomingFriends.length}</span></div>{incomingFriends.map(profile => <div className="friend-request" key={profile.id}><span>{profile.avatar}</span><div><b>{profile.nickname}</b><p>{profile.id} · {profile.school}</p></div><button onClick={() => props.onAcceptRequest(profile.id)}>同意</button><button onClick={() => props.onIgnoreRequest(profile.id)}>忽略</button></div>)}</div>}
        <div className="friend-panel"><div className="friend-panel-title"><b>我的好友</b><span>{friends.length}</span></div>{friends.length ? friends.map(profile => <button className="friend-row" key={profile.id} onClick={() => props.onOpenChat(profile)}><span>{profile.avatar}</span><div><b>{profile.nickname}</b><p>{profile.lastActive}</p></div><em>聊天 →</em></button>) : <div className="friend-side-empty"><span><Icon name="users" size="lg"/></span><p>添加的好友会出现在这里</p></div>}</div>
      </aside>
    </div>
  </div>;
}
