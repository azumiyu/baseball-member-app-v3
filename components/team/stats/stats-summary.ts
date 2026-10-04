import type { PlateAppearanceResult, PlayerStats } from "@/lib/stats";

const HIT_RESULTS: readonly PlateAppearanceResult[] = ["安打", "二塁打", "三塁打", "本塁打"];
const NON_AT_BAT_RESULTS: readonly PlateAppearanceResult[] = ["四球", "死球", "エンドラン", "犠打", "犠飛"];

export function isHitResult(result: PlateAppearanceResult | null): boolean {
  return result !== null && HIT_RESULTS.includes(result);
}

export const SUMMARY_FIRST_ROW = [
  ["plateAppearances", "打席"],
  ["atBats", "打数"],
  ["hits", "安打"],
  ["homeRuns", "本塁打"],
  ["doubles", "二塁打"],
  ["triples", "三塁打"],
  ["scoringAtBats", "得点圏打数"],
  ["scoringHits", "得点圏安打"],
  ["strikeouts", "三振"],
  ["walks", "四球"],
  ["hitByPitches", "死球"],
] as const;
export const SUMMARY_SECOND_ROW = [
  ["rbis", "打点"],
  ["runs", "得点"],
  ["stolenBases", "盗塁"],
  ["sacrificeBunts", "犠打"],
  ["sacrificeFlies", "犠飛"],
  ["doublePlays", "併殺打"],
  ["opponentErrors", "敵失"],
  ["errors", "失策"],
  ["caughtStealingAttempts", "盗塁死"],
  ["caughtStealing", "盗塁阻止"],
] as const;

export type SummaryValues = Record<
  | (typeof SUMMARY_FIRST_ROW)[number][0]
  | (typeof SUMMARY_SECOND_ROW)[number][0],
  number
>;

export function summarizeStats(values: PlayerStats): SummaryValues {
  const results = values.plateAppearances;
  const completed = results.filter(
    (result): result is PlateAppearanceResult => result !== null,
  );
  const scoringResults = results.filter(
    (result, index): result is PlateAppearanceResult =>
      result !== null && values.scoringPosition[index] === true,
  );
  const count = (result: PlateAppearanceResult, source = completed) =>
    source.filter((item) => item === result).length;
  const atBats = completed.filter(
    (result) =>
      !NON_AT_BAT_RESULTS.includes(result),
  ).length;
  return {
    plateAppearances: completed.length,
    atBats,
    hits: completed.filter(isHitResult).length,
    homeRuns: count("本塁打"),
    rbis: values.rbis,
    runs: values.runs,
    stolenBases: values.stolenBases,
    doubles: count("二塁打"),
    triples: count("三塁打"),
    scoringAtBats: scoringResults.filter(
      (result) =>
        !NON_AT_BAT_RESULTS.includes(result),
    ).length,
    scoringHits: scoringResults.filter(isHitResult).length,
    strikeouts: count("三振"),
    walks: count("四球"),
    hitByPitches: count("死球"),
    sacrificeBunts: count("犠打"),
    sacrificeFlies: count("犠飛"),
    doublePlays: count("併殺打"),
    opponentErrors: count("敵失"),
    errors: values.errors,
    caughtStealingAttempts: values.caughtStealingAttempts,
    caughtStealing: values.caughtStealing,
  };
}
