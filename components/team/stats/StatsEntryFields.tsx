"use client";

import { useEffect } from "react";
import { PLATE_APPEARANCE_RESULTS, type PlateAppearanceResult, type PlayerStats } from "@/lib/stats";
import { isHitResult } from "./stats-summary";
import { addPlateAppearance, updatePlateAppearance, updateScoringPosition, updateStatsNumber } from "./stats-actions";

const NUMBER_FIELDS = [
  ["rbis", "打点"],
  ["runs", "得点"],
  ["stolenBases", "盗塁"],
  ["caughtStealingAttempts", "盗塁死"],
  ["errors", "失策"],
  ["caughtStealing", "盗塁阻止"],
] as const;
const STAT_NUMBER_OPTIONS = Array.from({ length: 11 }, (_, index) => index);
const RBIS_NUMBER_OPTIONS = Array.from({ length: 21 }, (_, index) => index);

export function StatsEntryFields({ values, openPlate, onOpenPlateChange, onChange }: {
  values: PlayerStats;
  openPlate: number | null;
  onOpenPlateChange: (index: number | null) => void;
  onChange: (updater: (current: PlayerStats) => PlayerStats) => void;
}) {
  useEffect(() => {
    if (openPlate === null) return;
    const closeOnOutsideInteraction = (event: FocusEvent | PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest(".plate-entry")?.getAttribute("data-plate-index") !==
          String(openPlate)
      )
        onOpenPlateChange(null);
    };
    document.addEventListener("focusin", closeOnOutsideInteraction);
    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    return () => {
      document.removeEventListener("focusin", closeOnOutsideInteraction);
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
    };
  }, [openPlate, onOpenPlateChange]);
  const updatePlate = (index: number, result: PlateAppearanceResult | null) => {
    onChange((current) => updatePlateAppearance(current, index, result));
    onOpenPlateChange(null);
  };
  const addPlate = () => onChange(addPlateAppearance);
  const updateScoring = (index: number, checked: boolean) =>
    onChange((current) => updateScoringPosition(current, index, checked));
  const updateNumber = (field: (typeof NUMBER_FIELDS)[number][0], value: string) =>
    onChange((current) => updateStatsNumber(current, field, value));

  return (
    <>
      <h2 className="stats-section-heading">打席結果</h2>
      <div className="plate-entry-grid">
        {values.plateAppearances.map(
          (result: PlateAppearanceResult | null, index: number) => (
            <div
              className="plate-entry"
              data-plate-index={index}
              key={index}
              onKeyDown={(event) => {
                if (event.key === "Escape" && openPlate === index) {
                  event.preventDefault();
                  onOpenPlateChange(null);
                  event.currentTarget
                    .querySelector<HTMLButtonElement>(".plate-square")
                    ?.focus();
                }
              }}
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                )
                  onOpenPlateChange(null);
              }}
            >
              <button
                type="button"
                className={`plate-square ${result ? "filled" : ""}${isHitResult(result) ? " hit-result" : ""}${result === "四球" || result === "死球" ? " walk-result" : ""}`}
                aria-expanded={openPlate === index}
                aria-controls={
                  openPlate === index
                    ? `plate-result-menu-${index}`
                    : undefined
                }
                onClick={() =>
                  onOpenPlateChange(openPlate === index ? null : index)
                }
              >
                <small>{index + 1}打席目</small>
                <strong>{result ?? "選択"}</strong>
              </button>
              {openPlate === index && (
                <div
                  className="plate-result-menu"
                  id={`plate-result-menu-${index}`}
                  role="group"
                  aria-label={`${index + 1}打席目の結果`}
                  onClick={(event) => {
                    event.currentTarget
                      .closest(".plate-entry")
                      ?.querySelector<HTMLButtonElement>(
                        ".plate-square",
                      )
                      ?.focus();
                  }}
                >
                  {PLATE_APPEARANCE_RESULTS.map((option) => (
                    <button
                      type="button"
                      key={option}
                      aria-pressed={result === option}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => updatePlate(index, option)}
                    >
                      {option}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="plate-clear-button"
                    disabled={
                      result === null &&
                      values.scoringPosition[index] !== true
                    }
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => updatePlate(index, null)}
                  >
                    未入力に戻す
                  </button>
                </div>
              )}
              <label className="scoring-position-field">
                <span>得点圏</span>
                <input
                  type="checkbox"
                  aria-label={`${index + 1}打席目の得点圏`}
                  checked={
                    values.scoringPosition[index] === true
                  }
                  onChange={(event) =>
                    updateScoring(index, event.target.checked)
                  }
                />
              </label>
            </div>
          ),
        )}
        <button
          type="button"
          className="plate-add-button"
          onClick={addPlate}
          aria-label="打席を追加"
        >
          ＋<small>打席追加</small>
        </button>
      </div>
      <h2 className="stats-section-heading">その他の成績</h2>
      <div className="stats-number-grid">
        {NUMBER_FIELDS.map(([field, label]) => (
          <label key={field} htmlFor={`stat-${field}`}>
            <span>{label}</span>
            <select
              id={`stat-${field}`}
              value={values[field]}
              onChange={(event) =>
                updateNumber(field, event.target.value)
              }
            >
              {(field === "rbis"
                ? RBIS_NUMBER_OPTIONS
                : STAT_NUMBER_OPTIONS
              ).map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </>
  );
}
