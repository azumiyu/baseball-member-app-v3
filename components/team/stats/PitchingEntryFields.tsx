"use client";

import { emptyPitchingStats, formatInningsPitched, type PitchingStats, type PlayerStats } from "@/lib/stats";
import { updatePitchingNumber } from "./stats-actions";

const PITCHING_FIELDS = [
  ["inningsPitchedOuts", "投球回"],
  ["runsAllowed", "失点"],
  ["earnedRuns", "自責点"],
  ["hitsAllowed", "被安打"],
  ["homeRunsAllowed", "被本塁打"],
  ["strikeouts", "奪三振"],
  ["walksAllowed", "与四球"],
  ["hitByPitch", "与死球"],
] as const satisfies ReadonlyArray<readonly [keyof PitchingStats, string]>;

const COUNT_OPTIONS = Array.from({ length: 31 }, (_, index) => index);
const INNINGS_OUT_OPTIONS = Array.from({ length: 46 }, (_, index) => index);

export function PitchingEntryFields({ values, onChange }: {
  values: PlayerStats;
  onChange: (updater: (current: PlayerStats) => PlayerStats) => void;
}) {
  const pitching = values.pitching ?? emptyPitchingStats();

  return (
    <>
      <h2 className="stats-section-heading">投手成績</h2>
      <p className="stats-pitching-hint">投球回はアウト数をもとに1/3回ずつ選択できます。</p>
      <div className="stats-number-grid stats-pitching-grid">
        {PITCHING_FIELDS.map(([field, label]) => (
          <label key={field} htmlFor={`pitching-${field}`}>
            <span>{label}</span>
            <select
              id={`pitching-${field}`}
              value={pitching[field]}
              onChange={(event) => onChange((current) => updatePitchingNumber(current, field, event.target.value))}
            >
              {(field === "inningsPitchedOuts" ? INNINGS_OUT_OPTIONS : COUNT_OPTIONS).map((value) => (
                <option key={value} value={value}>
                  {field === "inningsPitchedOuts" ? formatInningsPitched(value) : value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </>
  );
}
