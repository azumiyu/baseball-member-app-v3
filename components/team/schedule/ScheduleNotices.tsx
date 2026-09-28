"use client";

import { useEffect, useState } from "react";
import { japanDate, SCHEDULE_LIMITS, type ScheduleGame, type ScheduleResponse } from "@/lib/schedule";
import { Modal } from "../common/Modal";
import { SaveStateLabel } from "../common/SaveStateLabel";
import type { SaveState } from "../types";

type Notice = { changed: boolean; games: { id: string; version: number; changed: boolean }[] };
const answers = [
  { status: "undecided", label: "未定" },
  { status: "attending", label: "参加" },
  { status: "absent", label: "不参加" },
] as const;

function changedGames(games: ScheduleGame[], memberId: string, dismissed: Record<string, number>) {
  return games.filter((game) => game.date >= japanDate() && game.responses[memberId]
    && game.changedBy !== memberId
    && game.responses[memberId].confirmedRevision < game.detailsRevision
    && (dismissed[game.id] ?? 0) < game.detailsRevision);
}

function noticeFor(games: ScheduleGame[], changed: boolean): Notice | null {
  return games.length ? { changed, games: games.map((game) => ({ id: game.id, version: game.detailsRevision, changed })) } : null;
}

function ChangeComparison({ game }: { game: ScheduleGame }) {
  const changes = [
    { label: "開始時刻", before: game.previousStartTime, after: game.startTime, empty: "時刻未定" },
    { label: "終了時刻", before: game.previousEndTime, after: game.endTime, empty: "時刻未定" },
    { label: "場所", before: game.previousLocation, after: game.location, empty: "場所未定" },
  ].filter((change) => change.before !== null && change.before !== change.after);
  if (!changes.length) return null;
  return <div className="schedule-change-comparison">
    <strong>直近の変更</strong>
    <dl>{changes.map((change) => <div key={change.label}>
      <dt>{change.label}</dt>
      <dd>
        <div><small>変更前 / Before</small><span>{change.before || change.empty}</span></div>
        <div><small>変更後 / After</small><span>{change.after || change.empty}</span></div>
      </dd>
    </div>)}</dl>
  </div>;
}

/** 回答中・保存中は対象一覧を保持し、全件の回答・変更確認が保存されたら閉じる。 */
export function ScheduleNotices({ games, initialGames, memberId, suspended, saveState, error, onResponse, onRetry, onOpenSchedule }: {
  games: ScheduleGame[];
  initialGames: ScheduleGame[];
  memberId: string;
  suspended: boolean;
  saveState: SaveState;
  error: string;
  onResponse: (gameId: string, response: Pick<ScheduleResponse, "status" | "comment">) => void;
  onRetry: () => void;
  onOpenSchedule: (gameId: string) => void;
}) {
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(() => {
    const changed = changedGames(initialGames, memberId, {});
    const unanswered = initialGames.filter((game) => game.date >= japanDate() && !game.responses[memberId]);
    // 初回は変更された試合と未回答の試合をまとめて案内する。
    const changedNotice = noticeFor(changed, true);
    const unansweredNotice = noticeFor(unanswered, false);
    return changedNotice ? { ...changedNotice, games: [...changedNotice.games, ...(unansweredNotice?.games ?? [])] } : unansweredNotice;
  });
  const rows = notice?.games.flatMap((entry) => {
    const game = games.find((game) => game.id === entry.id && game.date >= japanDate());
    return game && (!entry.changed || game.changedBy !== memberId) ? [{ game, changed: entry.changed }] : [];
  }) ?? [];
  const isConfirmed = (game: ScheduleGame) => {
    const response = game.responses[memberId];
    return !!response && response.confirmedRevision >= game.detailsRevision
      && (response.status !== "undecided" || !!response.comment.trim())
      && !Object.hasOwn(commentDrafts, game.id);
  };
  const allConfirmed = rows.every(({ game }) => isConfirmed(game));

  useEffect(() => {
    if (suspended || saveState !== "saved" || error) return;
    const next = notice
      ? allConfirmed ? null : notice
      : noticeFor(changedGames(games, memberId, dismissed), true);
    // 保存結果・外部更新に合わせて通知を開閉する。失敗時は回答と再試行を残す。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next !== notice) setNotice(next);
  }, [games, memberId, dismissed, notice, suspended, saveState, error, allConfirmed]);

  const close = () => {
    if (notice) setDismissed((current) => ({ ...current, ...Object.fromEntries(notice.games.map((game) => [game.id, game.version])) }));
    setNotice(null);
    setCommentDrafts({});
  };
  const clearCommentDraft = (gameId: string) => setCommentDrafts((current) => {
    const next = { ...current };
    delete next[gameId];
    return next;
  });
  const startComment = (game: ScheduleGame) => setCommentDrafts((current) => ({
    ...current, [game.id]: current[game.id] ?? game.responses[memberId]?.comment ?? "",
  }));

  return <Modal
    open={notice !== null && !suspended}
    onClose={close}
    title={notice?.changed ? "予定が変更された試合があります！" : "出欠が未入力の試合があります！"}
    description={notice?.changed ? "試合時刻・場所の変更をご確認ください。参加状況が同じなら「変更なし」、変わる場合は出欠を選んでください。未定の場合はコメントもお願いします。" : "この画面から回答できます。未定の場合は、いつ分かるか・参加できる条件をコメントしてください。"}
  >
    <ul className="schedule-reminder-list">
      {rows.map(({ game, changed }) => {
        const response = game.responses[memberId];
        const editingComment = Object.hasOwn(commentDrafts, game.id);
        const comment = commentDrafts[game.id] ?? response?.comment ?? "";
        const selectedStatus = editingComment ? "undecided" : response?.status;
        const confirmed = isConfirmed(game);
        const commentId = `notice-comment-${game.id}`;
        return <li key={game.id}>
          <strong>{game.date.replaceAll("-", "/")} {game.startTime || "時刻未定"}</strong>
          <span>{game.title || "大会名未設定"}{game.opponent && ` ／ ${game.opponent}`}</span>
          {game.location && <span>{game.location}</span>}
          {changed && <ChangeComparison game={game} />}
          {changed && response && <button
            type="button"
            className="schedule-unchanged-button"
            disabled={saveState === "conflict" || confirmed || editingComment}
            onClick={() => {
              if (response.status === "undecided" && !response.comment.trim()) startComment(game);
              else onResponse(game.id, { status: response.status, comment: response.comment });
            }}
          >{confirmed ? "確認済み" : "変更なし"}</button>}
          <div className="schedule-attendance-buttons" role="group" aria-label={`${game.date} ${game.title || "試合"}の出欠`}>
            {answers.map(({ status, label }) => <button key={status} type="button" className={`schedule-attendance-button ${status}`} aria-pressed={selectedStatus === status} disabled={saveState === "conflict"} onClick={() => {
              if (status === "undecided") startComment(game);
              else {
                clearCommentDraft(game.id);
                onResponse(game.id, { status, comment: comment.trim() });
              }
            }}>{label}</button>)}
          </div>
          {selectedStatus === "undecided" && <form className="schedule-response-editor schedule-notice-comment" onSubmit={(event) => {
            event.preventDefault();
            if (saveState === "conflict" || !comment.trim()) return;
            onResponse(game.id, { status: "undecided", comment: comment.trim() });
            clearCommentDraft(game.id);
          }}>
            <label htmlFor={commentId}>いつ分かるか・参加できる条件 <span>必須・全員に表示</span></label>
            <textarea
              id={commentId}
              rows={3}
              required
              maxLength={SCHEDULE_LIMITS.comment}
              placeholder="例：10/8までに分かります。午前なら参加可能です。"
              value={comment}
              readOnly={saveState === "conflict"}
              onChange={(event) => setCommentDrafts((current) => ({ ...current, [game.id]: event.target.value }))}
            />
            {editingComment && <p className="schedule-autosave-note">入力中のコメントは、下の回答ボタンで保存されます。</p>}
            <button type="submit" className="primary" disabled={saveState === "conflict" || !comment.trim()}>コメントを保存して未定で回答</button>
          </form>}
        </li>;
      })}
    </ul>
    {!rows.length && <p>案内する試合はありません。</p>}
    <p className={`schedule-form-save-state ${saveState}`} role="status"><SaveStateLabel state={saveState} /></p>
    {error && <div className="schedule-form-error" role="alert"><p>{error}</p>{saveState === "error" && <button className="secondary" type="button" onClick={onRetry}>保存を再試行</button>}</div>}
    <div className="schedule-form-actions">
      <button type="button" className="secondary" onClick={() => { const id = rows[0]?.game.id; close(); if (id) onOpenSchedule(id); }}>スケジュールを見る</button>
      <button type="button" className="primary" onClick={close}>あとで</button>
    </div>
  </Modal>;
}
