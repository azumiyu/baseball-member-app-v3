"use client";
import { CalendarDays, ChevronDown, FileDown } from "lucide-react";
import type { TeamData } from "@/lib/model";
import type { ScheduleGame } from "@/lib/schedule";
import { shortScheduleLabel } from "../lib/schedule-options";

type ScheduleOption = Omit<ScheduleGame, "responses">;

function addCandidate(values: string[], value: string): string[] {
  return !value || values.includes(value) ? values : [...values, value].slice(-200);
}

function applySchedule(data: TeamData, game: ScheduleOption): TeamData {
  return {
    ...data,
    scheduleId: game.id,
    date: game.date,
    tournament: game.title,
    opponent: game.opponent,
    startTime: game.startTime,
    location: game.location,
    mapUrl: game.mapUrl,
    tournaments: addCandidate(data.tournaments, game.title),
    opponents: addCandidate(data.opponents, game.opponent),
    locations: addCandidate(data.locations, game.location),
  };
}

function compareSchedules(a: ScheduleOption, b: ScheduleOption): number {
  return a.date.localeCompare(b.date)
    || (a.startTime || "99:99").localeCompare(b.startTime || "99:99")
    || a.id.localeCompare(b.id);
}

/**
 * 左側（スマホでは折りたたみ）の試合情報パネル。
 * 対象試合を選び、試合情報の編集はスケジュールに引き継ぎます。
 */
export function MatchInfoPanel({
  data,
  scheduleOptions,
  onOpenSchedule,
  readOnly,
  selectionDisabled = false,
  edit,
  infoOpen,
  onToggleInfo,
}: {
  data: TeamData;
  scheduleOptions: ScheduleOption[];
  onOpenSchedule: () => void;
  readOnly: boolean;
  selectionDisabled?: boolean;
  edit: (fn: (d: TeamData) => TeamData) => void;
  infoOpen: boolean;
  onToggleInfo: () => void;
}) {
  const schedules = [...scheduleOptions].sort(compareSchedules);
  const selectedId = schedules.some((game) => game.id === data.scheduleId) ? data.scheduleId ?? "" : "";

  return (
    <aside className={`panel match-panel ${infoOpen ? "info-open" : ""}`}>
      <button
        className="mobile-info-toggle"
        onClick={onToggleInfo}
        aria-expanded={infoOpen}
      >
        <CalendarDays size={19} />
        <span>
          {data.date.replaceAll("-", " / ")}
          <small>{data.opponent ? `vs ${data.opponent}` : "試合情報"}</small>
        </span>
        <ChevronDown size={18} />
      </button>

      <div className="match-fields">
        <h2>試合情報</h2>

        <label>
          試合を選択
          <select
            className="combobox-trigger min-w-0 w-full"
            value={selectedId}
            disabled={readOnly || selectionDisabled || schedules.length === 0}
            onChange={(e) => {
              const game = schedules.find((candidate) => candidate.id === e.target.value);
              if (game) edit((current) => applySchedule(current, game));
            }}
          >
            <option value="" disabled>{schedules.length ? "登録済みの試合を選択" : "登録済みの試合はありません"}</option>
            {schedules.map((game) => (
              <option key={game.id} value={game.id}>
                {shortScheduleLabel(game, schedules)}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="secondary mb-5 w-full" onClick={onOpenSchedule}>
          <CalendarDays size={17} />
          {readOnly ? "スケジュールを見る" : "スケジュールで編集"}
        </button>

        <div className="paper-note">
          <FileDown size={21} />
          <div>
            <strong>A4横・3枚綴り</strong>
            <p>提出用2枚と空欄1枚を出力</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
