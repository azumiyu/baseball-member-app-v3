import type { Player } from "@/lib/model";
import type { PlayerStats } from "@/lib/stats";
import { SUMMARY_FIRST_ROW, SUMMARY_SECOND_ROW, isHitResult, summarizeStats, type SummaryValues } from "./stats-summary";

export function StatsValues({
  player,
  battingOrder,
  values,
  canEdit,
  onEdit,
  onDelete,
}: {
  player: Player;
  battingOrder?: number;
  values: PlayerStats;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const summary = summarizeStats(values);
  const renderSummary = (fields: readonly (readonly [string, string])[]) =>
    fields.map(([field, label]) => (
      <span key={field}>
        <small>{label}</small>
        <strong>{summary[field as keyof SummaryValues]}</strong>
      </span>
    ));
  return (
    <div className="stats-confirm-player">
      <div className="stats-confirm-player-info">
        <div className="stats-confirm-player-name">
          <strong>{player.name}</strong>
          {battingOrder !== undefined && <small className="stats-confirm-batting-order">打順：{battingOrder}</small>}
        </div>
        <div className="stats-confirm-player-details">
          <small>#{player.number}</small>
          <span className="stats-confirm-results" aria-label="登録された打席結果">
            {values.plateAppearances.map((result, index) => result !== null && (
              <span
                key={index}
                className={isHitResult(result)
                  ? "stats-confirm-result-hit"
                  : result === "四球" || result === "死球"
                    ? "stats-confirm-result-walk"
                    : undefined}
              >
                {result}
              </span>
            ))}
          </span>
        </div>
      </div>
      <div className="stats-confirm-summary">
        <div className="stats-summary-grid">
          <div className="stats-summary-row first">
            {renderSummary(SUMMARY_FIRST_ROW)}
          </div>
          <div className="stats-summary-row second">
            {renderSummary(SUMMARY_SECOND_ROW.slice(0, 3))}
            <span className="stats-summary-empty" aria-hidden="true" />
            {renderSummary(SUMMARY_SECOND_ROW.slice(3))}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="stats-confirm-actions">
          <button type="button" className="stats-edit-button" onClick={onEdit}>
            編集
          </button>
          <button
            type="button"
            className="stats-delete-button"
            onClick={onDelete}
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}
