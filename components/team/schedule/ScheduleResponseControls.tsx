"use client";

import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Player } from "@/lib/model";
import { SCHEDULE_LIMITS, type ScheduleGame, type ScheduleResponse } from "@/lib/schedule";
import { ATTENDANCE, RESPONSE_FILTERS, type ResponseFilter, type ResponseInput } from "./schedule-presentation";

export function ScheduleResponseEditor({
  gameId, player, response, disabled, onChange,
}: {
  gameId: string;
  player: Pick<Player, "id" | "name">;
  response?: ScheduleResponse;
  disabled: boolean;
  onChange: (response: ResponseInput) => void;
}) {
  const fieldId = useId();
  const commentId = `schedule-comment-${gameId}-${player.id}-${fieldId}`;
  const [commentOpen, setCommentOpen] = useState(Boolean(response?.comment));
  return (
    <div className="schedule-response-editor">
      <div className="schedule-attendance-buttons" role="group" aria-label={`${player.name}の出欠`}>
        {ATTENDANCE.map(({ status, label, symbol }) => (
          <button
            key={status}
            type="button"
            className={`schedule-attendance-button ${status}`}
            aria-pressed={response?.status === status}
            disabled={disabled}
            onClick={() => onChange({ status, comment: response?.comment ?? "" })}
          >
            <span aria-hidden="true">{symbol}</span>{label}
            {response?.status === status && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <button type="button" className="schedule-comment-toggle" aria-expanded={commentOpen} aria-controls={`${commentId}-fields`} onClick={() => setCommentOpen(!commentOpen)}>
        <span>コメント <small>{response?.comment ? "入力済み" : "任意"}</small></span><ChevronDown size={16} aria-hidden="true" />
      </button>
      <div id={`${commentId}-fields`} className="schedule-comment-fields" data-open={commentOpen}>
      <label htmlFor={commentId}>コメント <span>任意・全員に表示</span></label>
      <textarea
        id={commentId}
        rows={2}
        maxLength={SCHEDULE_LIMITS.comment}
        placeholder="例：30分ほど遅れます"
        value={response?.comment ?? ""}
        readOnly={disabled}
        onChange={(event) => onChange({
          status: response?.status ?? "undecided",
          comment: event.target.value,
        })}
      />
      </div>
      <p className="schedule-autosave-note">出欠・コメントは自動保存されます。</p>
    </div>
  );
}

export function ScheduleResponseCounts({ game, players, selected, onSelect }: {
  game: ScheduleGame;
  players: Player[];
  selected?: ResponseFilter;
  onSelect: (filter: ResponseFilter) => void;
}) {
  const counts = { all: players.length, attending: 0, absent: 0, undecided: 0, unanswered: 0 };
  for (const player of players) counts[game.responses[player.id]?.status ?? "unanswered"] += 1;
  return (
    <div className="schedule-response-counts" role="group" aria-label="出欠の集計">
      {RESPONSE_FILTERS.map(({ status, label }) => (
        <button key={status} type="button" className={status} aria-haspopup={selected === undefined ? "dialog" : undefined} aria-pressed={selected === undefined ? undefined : selected === status} aria-label={`${label} ${counts[status]}人の出欠・コメント`} onClick={() => onSelect(status)}>
          <span>{label}</span><strong>{counts[status]}</strong>
        </button>
      ))}
    </div>
  );
}
