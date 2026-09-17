"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/AuthProvider";
import {
  ApiRequestError,
  cancelPublishedRequest,
  getCurrentMatching,
  getMyRequests,
  runMatching,
  type PersistedMatchRun,
  type PublishedRequest,
} from "@/lib/p0-api";
import {
  canCancelRequest,
  canRunRequestMatching,
  chooseRequestId,
  requestStatusLabel,
} from "@/lib/p0-requests";

type Props = {
  onCreateRequest: () => void;
  onNotify: (message: string) => void;
};

type MatchState = "idle" | "loading" | "ready" | "empty" | "error";

const formatDateTime = (value: string) => new Date(value).toLocaleString("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "操作失败，请稍后重试";

export default function P0RequestCenter({ onCreateRequest, onNotify }: Props) {
  const { accessToken } = useAuth();
  const [requests, setRequests] = useState<PublishedRequest[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [matchRun, setMatchRun] = useState<PersistedMatchRun | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [matchState, setMatchState] = useState<MatchState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) || null,
    [requests, selectedId],
  );

  const writeSelectionToUrl = (requestId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "requests");
    if (requestId) url.searchParams.set("request", requestId);
    else url.searchParams.delete("request");
    window.history.replaceState(null, "", url);
  };

  const selectRequest = (requestId: string) => {
    setSelectedId(requestId);
    setError("");
    writeSelectionToUrl(requestId);
  };

  const reloadRequests = async (preferredId = selectedId) => {
    const rows = await getMyRequests(accessToken);
    setRequests(rows);
    const nextId = chooseRequestId(rows, preferredId);
    setSelectedId(nextId);
    writeSelectionToUrl(nextId);
    return rows;
  };

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const preferredId = new URL(window.location.href).searchParams.get("request") || "";
      void getMyRequests(accessToken)
        .then((rows) => {
          if (!active) return;
          const nextId = chooseRequestId(rows, preferredId);
          setRequests(rows);
          setSelectedId(nextId);
          writeSelectionToUrl(nextId);
          setError("");
        })
        .catch((caught) => {
          if (active) setError(errorMessage(caught));
        })
        .finally(() => {
          if (active) setListLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!selectedId) {
        setMatchRun(null);
        setMatchState("idle");
        return;
      }
      setMatchState("loading");
      void getCurrentMatching(accessToken, selectedId)
        .then((result) => {
          if (!active) return;
          setMatchRun(result);
          setMatchState("ready");
        })
        .catch((caught) => {
          if (!active) return;
          setMatchRun(null);
          if (caught instanceof ApiRequestError && caught.code === "MATCH_RUN_NOT_FOUND") {
            setMatchState("empty");
            return;
          }
          setMatchState("error");
          setError(errorMessage(caught));
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, selectedId]);

  const refresh = async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    setError("");
    try {
      await reloadRequests(selectedId);
      try {
        const result = await getCurrentMatching(accessToken, selectedId);
        setMatchRun(result);
        setMatchState("ready");
      } catch (caught) {
        if (caught instanceof ApiRequestError && caught.code === "MATCH_RUN_NOT_FOUND") {
          setMatchRun(null);
          setMatchState("empty");
        } else {
          throw caught;
        }
      }
      onNotify("需求状态已更新");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const runCurrentMatching = async () => {
    if (!selected || busy || !canRunRequestMatching(selected.status)) return;
    setBusy(true);
    setError("");
    try {
      await runMatching(accessToken, selected.id);
      const result = await getCurrentMatching(accessToken, selected.id);
      setMatchRun(result);
      setMatchState("ready");
      await reloadRequests(selected.id);
      onNotify(`匹配完成，找到 ${result.candidateCount} 位候选人`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const cancelCurrent = async () => {
    if (!selected || busy || !canCancelRequest(selected.status)) return;
    setBusy(true);
    setError("");
    try {
      const cancelled = await cancelPublishedRequest(accessToken, selected.id);
      setRequests((current) => current.map((request) => request.id === cancelled.id ? { ...request, ...cancelled } : request));
      onNotify("需求已取消");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return <section className="workspace-view p0-request-center">
    <header className="request-center-head">
      <div><span>MY REQUESTS</span><h2>我的需求</h2><p>查看进度，继续匹配或发起新需求。</p></div>
      <button onClick={onCreateRequest}>发起新需求 <b>＋</b></button>
    </header>

    {error && <p className="p0-error" role="alert">{error}</p>}

    {listLoading ? <div className="request-center-loading">正在加载你的需求…</div> : !requests.length ? <div className="request-center-empty">
      <span>组</span><h3>还没有发起过需求</h3><p>先发布一条数学建模组队需求吧。</p><button onClick={onCreateRequest}>发起第一条需求</button>
    </div> : <div className="request-center-layout">
      <aside className="request-list" aria-label="我的需求列表">
        <div><b>{requests.length} 条需求</b><button disabled={busy} onClick={() => void refresh()}>刷新</button></div>
        {requests.map((request) => <button key={request.id} className={request.id === selectedId ? "selected" : ""} onClick={() => selectRequest(request.id)}>
          <span className={`request-status status-${request.status.toLowerCase()}`}>{requestStatusLabel[request.status]}</span>
          <b>{request.title}</b>
          <small>{formatDateTime(request.startsAt)} · {request.participantLimit} 人</small>
        </button>)}
      </aside>

      {selected && <article className="request-detail">
        <header>
          <div><span>{selected.competitionName}</span><h3>{selected.title}</h3><p>{formatDateTime(selected.startsAt)} 至 {formatDateTime(selected.endsAt)}</p></div>
          <b className={`request-status status-${selected.status.toLowerCase()}`}>{requestStatusLabel[selected.status]}</b>
        </header>
        <div className="request-detail-summary">
          <div><small>队伍人数</small><b>{selected.participantLimit} 人</b></div>
          <div><small>每周投入</small><b>{selected.weeklyHoursRequired} 小时</b></div>
          <div><small>报名截止</small><b>{formatDateTime(selected.applicationDeadline)}</b></div>
        </div>

        <section className="request-match-result">
          <div><h4>匹配结果</h4>{matchRun && <span>{matchRun.candidateCount} 位候选人</span>}</div>
          {matchState === "loading" && <p>正在加载匹配结果…</p>}
          {matchState === "empty" && <div className="request-no-match"><b>还没有运行匹配</b><p>确认时间和投入要求后即可开始。</p></div>}
          {matchState === "error" && <div className="request-no-match"><b>暂时无法读取匹配结果</b><p>可以刷新后重试。</p></div>}
          {matchState === "ready" && matchRun && <div className="request-candidates">
            {matchRun.candidates.map((candidate) => <div key={candidate.id}>
              <span>{candidate.displayName.slice(0, 1)}</span><div><b>{candidate.displayName}</b><small>{candidate.candidateType === "PRIMARY" ? "主选" : "候补"} · {candidate.reasons.join(" · ")}</small></div><strong>{Number(candidate.score).toFixed(0)} 分</strong>
            </div>)}
            {!matchRun.candidates.length && <p>暂时没有合适成员，可以调整时间或投入要求后重新发布。</p>}
          </div>}
        </section>

        <footer>
          {canRunRequestMatching(selected.status) && <button className="primary" disabled={busy} onClick={() => void runCurrentMatching()}>{busy ? "处理中…" : matchState === "empty" ? "开始匹配" : "继续匹配"}</button>}
          {canCancelRequest(selected.status) && <button className="secondary" disabled={busy} onClick={() => void cancelCurrent()}>取消需求</button>}
          <button className="secondary" disabled={busy} onClick={() => void refresh()}>刷新状态</button>
        </footer>
      </article>}
    </div>}
  </section>;
}
