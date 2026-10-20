"use client";

import { useState } from "react";
import type { Player } from "@/lib/model";
import { formatInningsPitched, type PitchingStats, type StatsData, type StatsLineups } from "@/lib/stats";
import { StatsValues } from "./StatsValues";
import { registeredPlayersByBattingOrder } from "./stats-actions";

export function StatsConfirmation({ games, data, players, lineups, canEditPlayer, gameLabel, onEdit, onDelete, onAdd }: {
  games: Array<{ key: string }>;
  data: StatsData;
  players: Player[];
  lineups: StatsLineups;
  canEditPlayer: (playerId: string) => boolean;
  gameLabel: (key: string) => string;
  onEdit: (gameKey: string, playerId: string, view: "batting" | "pitching") => void;
  onDelete: (gameKey: string, player: Player) => void;
  onAdd: () => void;
}) {
  const [view, setView] = useState<"batting" | "pitching">("batting");
  const hasPitchingStats = games.some(({ key }) => Object.values(data.games[key] ?? {}).some((stats) => stats.pitching));
  const activeView = hasPitchingStats ? view : "batting";
  const renderPitchingSummary = (values: PitchingStats) => [
    ["投球回", formatInningsPitched(values.inningsPitchedOuts)],
    ["失点", values.runsAllowed],
    ["自責点", values.earnedRuns],
    ["被安打", values.hitsAllowed],
    ["被本塁打", values.homeRunsAllowed],
    ["奪三振", values.strikeouts],
    ["与四球", values.walksAllowed],
    ["与死球", values.hitByPitch],
  ] as const;
  const hasBattingStats = (values: StatsData["games"][string][string]) =>
    values.plateAppearances.some((result) => result !== null)
    || values.rbis > 0 || values.runs > 0 || values.stolenBases > 0
    || values.caughtStealingAttempts > 0 || values.errors > 0 || values.caughtStealing > 0;

  return (
    <>
      {hasPitchingStats && (
        <nav className="tabs stats-confirm-tabs" aria-label="確認する成績">
          <button type="button" className={activeView === "batting" ? "active" : ""} aria-pressed={activeView === "batting"} onClick={() => setView("batting")}>野手成績</button>
          <button type="button" className={activeView === "pitching" ? "active" : ""} aria-pressed={activeView === "pitching"} onClick={() => setView("pitching")}>投手成績</button>
        </nav>
      )}
      <div className="stats-confirm-list">
        {games.length === 0 ? (
          <div className="panel">
            <p className="stats-empty">まだ成績が登録されていません。</p>
          </div>
        ) : (
          games.map(({ key }, index) => (
            <section className="stats-game-group" key={key}>
              <div className={`stats-game-heading ${index === 0 ? 'is-first' : ''}`}>
                <h2>
                  {gameLabel(key)}
                </h2>
              </div>
              <div className="panel">
                {(() => {
                  const registered = registeredPlayersByBattingOrder(players, data.games[key], lineups[data.scheduleIds[key]]);
                  const visible = activeView === "pitching"
                    ? registered.filter(({ player }) => data.games[key][player.id].pitching)
                    : registered.filter(({ player }) => hasBattingStats(data.games[key][player.id]));
                  if (visible.length === 0) return <p className="stats-empty">{activeView === "pitching" ? "この試合の投手成績は登録されていません。" : "この試合の野手成績は登録されていません。"}</p>;
                  return visible.map(({ player, battingOrder }) => {
                    const values = data.games[key][player.id];
                    const canEdit = canEditPlayer(player.id);
                    const onDeletePlayer = () => { if (canEdit) onDelete(key, player); };
                    if (activeView === "pitching" && values.pitching) {
                      return (
                        <div className="stats-confirm-player stats-pitching-confirm-player" key={player.id}>
                          <div className="stats-confirm-player-name">
                            <strong>{player.name}</strong>
                            {battingOrder !== undefined && <small className="stats-confirm-batting-order">打順：{battingOrder}</small>}
                            <small>#{player.number}</small>
                          </div>
                          <div className="stats-pitching-summary">
                            {renderPitchingSummary(values.pitching).map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}
                          </div>
                          {canEdit && (
                            <div className="stats-confirm-actions">
                              <button type="button" className="stats-edit-button" onClick={() => onEdit(key, player.id, "pitching")}>編集</button>
                              <button type="button" className="stats-delete-button" onClick={onDeletePlayer}>削除</button>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <StatsValues
                        key={player.id}
                        player={player}
                        battingOrder={battingOrder}
                        values={values}
                        canEdit={canEdit}
                        onEdit={() => onEdit(key, player.id, "batting")}
                        onDelete={onDeletePlayer}
                      />
                    );
                  });
                })()}
              </div>
            </section>
          ))
        )}
      </div>
      <div className="stats-actions">
        <button
          type="button"
          className="secondary"
          onClick={onAdd}
        >
          成績を追加登録
        </button>
      </div>
    </>
  );
}
