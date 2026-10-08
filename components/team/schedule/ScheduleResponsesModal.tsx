"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { AuthMember } from "@/lib/auth-types";
import type { Player } from "@/lib/model";
import type { ScheduleGame } from "@/lib/schedule";
import { Modal } from "../common/Modal";
import { SaveStateLabel } from "../common/SaveStateLabel";
import type { SaveState } from "../types";
import { ScheduleResponseCounts, ScheduleResponseEditor } from "./ScheduleResponseControls";
import { ATTENDANCE, RESPONSE_FILTERS, formatDate, type ResponseFilter, type ResponseInput } from "./schedule-presentation";

export function ScheduleResponsesModal({ game, players, member, filter, open, disabled, saveState, error, onFilterChange, onResponse, onRetry, onClose }: {
  game: ScheduleGame;
  players: Player[];
  member: AuthMember;
  filter: ResponseFilter;
  open: boolean;
  disabled: boolean;
  saveState: SaveState;
  error: string;
  onFilterChange: (filter: ResponseFilter) => void;
  onResponse: (playerId: string, response: ResponseInput) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const filterLabel = RESPONSE_FILTERS.find(({ status }) => status === filter)?.label;
  // 未回答からの入力や出欠変更で、編集中の行が消えないようにする。
  const visiblePlayers = players.filter((player) => filter === "all" || (game.responses[player.id]?.status ?? "unanswered") === filter || player.id === editingPlayerId);
  return (
    <Modal open={open} onClose={onClose} title="出欠・コメント" description={`${formatDate(game.date)} ${game.title || "大会名未設定"}${game.opponent ? ` ／ vs ${game.opponent}` : ""}`}>
      <ScheduleResponseCounts game={game} players={players} selected={filter} onSelect={(next) => { setEditingPlayerId(null); onFilterChange(next); }} />
      {error && <div className="schedule-form-error" role="alert"><p>{error}</p>{saveState === "error" && <button type="button" className="secondary" onClick={onRetry}>保存を再試行</button>}{saveState === "conflict" && <p>閉じて、最新の内容を再読み込みしてください。</p>}</div>}
      {saveState !== "saved" && <p className="schedule-form-save-state" role="status"><SaveStateLabel state={saveState} /></p>}
      <div className="schedule-members" aria-label={`${filterLabel}の出欠・コメント`}>
        {visiblePlayers.length ? <ul>
          {visiblePlayers.map((player) => {
            const response = game.responses[player.id];
            const status = response?.status ?? "unanswered";
            const label = ATTENDANCE.find((entry) => entry.status === status)?.label ?? "未回答";
            const canEdit = member.isAdmin || player.id === member.id;
            const editing = editingPlayerId === player.id && canEdit;
            return (
              <li key={player.id}>
                <div className="schedule-member-heading">
                  <span className="schedule-member-name"><small>#{player.number}</small>{player.name}{player.id === member.id && <small>あなた</small>}</span>
                  <span className={`schedule-status-badge ${status}`}>{label}</span>
                  {canEdit && <button type="button" className="schedule-member-edit" disabled={disabled} aria-expanded={editing} aria-label={`${player.name}の回答を${editing ? "閉じる" : "編集"}`} onClick={() => setEditingPlayerId(editing ? null : player.id)}><Pencil size={14} aria-hidden="true" /><span>{editing ? "閉じる" : "編集"}</span></button>}
                </div>
                {editing ? <>
                  <ScheduleResponseEditor gameId={game.id} player={player} response={response} disabled={disabled} onChange={(next) => onResponse(player.id, next)} />
                  {filter !== "all" && status !== filter && <p className="schedule-autosave-note">現在は「{label}」です。編集を閉じると「{filterLabel}」の一覧から移動します。</p>}
                </> : response?.comment ? <p className="schedule-member-comment">{response.comment}</p> : null}
              </li>
            );
          })}
        </ul> : <p className="schedule-members-empty">{filter === "all" ? "登録されているメンバーはいません。" : `「${filterLabel}」のメンバーはいません。`}</p>}
      </div>
      <button type="button" className="secondary schedule-members-close" onClick={onClose}>閉じる</button>
    </Modal>
  );
}
