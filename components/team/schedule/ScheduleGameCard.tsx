"use client";

import { useId } from "react";
import { CalendarDays, ChevronDown, Clock3, ExternalLink, MapPin, Pencil, Users } from "lucide-react";
import type { AuthMember } from "@/lib/auth-types";
import type { Player } from "@/lib/model";
import { japanDate, mapLinks, type ScheduleGame } from "@/lib/schedule";
import { scheduleTimeRange } from "@/lib/schedule-format";
import { ScheduleResponseCounts, ScheduleResponseEditor } from "./ScheduleResponseControls";
import { ATTENDANCE, GAME_STATUSES, formatDate, weekday, type ResponseFilter, type ResponseInput } from "./schedule-presentation";

export function ScheduleGameCard({ game, players, member, featured, expanded, onToggle, disabled, onEdit, onResponse, onOpenResponses }: {
  game: ScheduleGame;
  players: Player[];
  member: AuthMember;
  featured: boolean;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  onEdit?: () => void;
  onResponse: (playerId: string, response: ResponseInput) => void;
  onOpenResponses: (filter: ResponseFilter) => void;
}) {
  const detailsId = useId();
  const maps = mapLinks(game);
  const ownPlayer = players.find((player) => player.id === member.id);
  const ownResponse = game.responses[member.id];
  const ownStatus = ATTENDANCE.find(({ status }) => status === ownResponse?.status)?.label ?? "未入力";

  return (
    <article className={`panel schedule-game-card${featured ? " featured" : ""}`}>
      <h2 className="schedule-game-heading">
        <button type="button" id={`${detailsId}-toggle`} className="schedule-game-summary" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>
          <span className="schedule-game-heading-copy">
            <span className="schedule-game-date">
              <CalendarDays size={16} aria-hidden="true" />
              <time dateTime={game.date}>
                <span className="schedule-date-full">{formatDate(game.date)}</span>
                <span className="schedule-date-compact">
                  {game.date.slice(0, 4) !== japanDate().slice(0, 4) ? `${game.date.slice(0, 4)}/` : <span className="sr-only">{game.date.slice(0, 4)}年</span>}
                  {Number(game.date.slice(5, 7))}/{Number(game.date.slice(8, 10))}（{weekday.format(new Date(`${game.date}T12:00:00+09:00`))}）
                </span>
              </time>
              {game.startTime && <span className="schedule-start-time">{game.startTime}</span>}
              {featured && <span className="schedule-featured-label">{game.date === japanDate() ? "本日" : "次の土曜"}</span>}
            </span>
            <span className="schedule-game-title"><strong>{game.title || "大会名未設定"}</strong><span className={`schedule-game-status ${game.status}`}>{GAME_STATUSES.find((entry) => entry.status === game.status)?.label}</span>{onEdit && (<span className={`schedule-game-status ${game.umpireArranged ? "umpire-arranged" : "umpire-pending"}`}>{game.umpireArranged ? "審判手配済" : "審判未手配"}</span>)}</span>
            <span className="schedule-game-summary-info">{game.opponent ? `vs ${game.opponent}` : "対戦相手未定"}{game.location && ` ／ ${game.location}`}</span>
          </span>
          <span className="schedule-game-summary-end"><span className={`schedule-status-badge ${ownResponse?.status ?? "unanswered"}`}>{ownStatus}<span className="sr-only">（あなたの出欠）</span></span><ChevronDown size={19} aria-hidden="true" /></span>
        </button>
      </h2>
      <div id={detailsId} hidden={!expanded} className="schedule-game-details" role="region" aria-labelledby={`${detailsId}-toggle`}>
        {onEdit && (
          <button type="button" className="schedule-edit-button" disabled={disabled} onClick={onEdit} aria-label={`${formatDate(game.date)} ${game.title || "試合予定"}を編集`}>
            <Pencil size={16} aria-hidden="true" /><span>試合情報を編集</span>
          </button>
        )}
      <div className="schedule-game-info">
        <p className="schedule-detail-date"><CalendarDays size={16} aria-hidden="true" /><time dateTime={game.date}>{formatDate(game.date)}</time></p>
        <p><Clock3 size={16} aria-hidden="true" /><span>{scheduleTimeRange(game)}</span></p>
        {game.opponent && <p className="schedule-detail-opponent"><Users size={16} aria-hidden="true" /><span>対戦相手：{game.opponent}</span></p>}
        <p className="schedule-detail-location"><MapPin size={16} aria-hidden="true" /><span>{game.location || "場所は未定"}</span></p>
      </div>
      {maps && (
        <div className="schedule-map-links" aria-label="試合会場の地図">
          <a href={maps.google} target="_blank" rel="noopener noreferrer">Googleマップ<ExternalLink size={13} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a>
          <a href={maps.apple} target="_blank" rel="noopener noreferrer">Appleマップ<ExternalLink size={13} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a>
        </div>
      )}
      {ownPlayer && (
        <section className="schedule-own-response" aria-label="自分の出欠回答">
          <h3>あなたの出欠 <span>{ownPlayer.name}</span></h3>
          <ScheduleResponseEditor gameId={game.id} player={ownPlayer} response={game.responses[member.id]} disabled={disabled} onChange={(response) => onResponse(member.id, response)} />
        </section>
      )}
      <ScheduleResponseCounts game={game} players={players} onSelect={onOpenResponses} />
      </div>
    </article>
  );
}
