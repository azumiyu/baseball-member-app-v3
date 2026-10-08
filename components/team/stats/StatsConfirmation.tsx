"use client";

import type { Player } from "@/lib/model";
import type { StatsData } from "@/lib/stats";
import { StatsValues } from "./StatsValues";
import { comparePlayersByNumber } from "./stats-actions";

export function StatsConfirmation({ games, data, players, canEditPlayer, gameLabel, onEdit, onDelete, onAdd }: {
  games: Array<{ key: string }>;
  data: StatsData;
  players: Player[];
  canEditPlayer: (playerId: string) => boolean;
  gameLabel: (key: string) => string;
  onEdit: (gameKey: string, playerId: string) => void;
  onDelete: (gameKey: string, player: Player) => void;
  onAdd: () => void;
}) {
  return (
    <>
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
                {players
                  .filter((player) => data.games[key]?.[player.id])
                  .sort(comparePlayersByNumber)
                  .map((player) => (
                    <StatsValues
                      key={player.id}
                      player={player}
                      values={data.games[key][player.id]}
                      canEdit={canEditPlayer(player.id)}
                      onEdit={() => onEdit(key, player.id)}
                      onDelete={() => {
                        if (!canEditPlayer(player.id)) return;
                        onDelete(key, player);
                      }}
                    />
                  ))}
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
