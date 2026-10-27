import { formatInningsPitched } from "./stats";
import { teamsOneStatNumber, type TeamsOneBattingResponse, type TeamsOneStatsKind } from "./teamsone-batters";

export type CumulativeMetric = { label: string; value: string };
export type TeamsOneCumulativeStats = { rates: CumulativeMetric[]; totals: CumulativeMetric[] };
export type CumulativeLeader = { id: string; name: string; number: string; value: string };

function sumColumn(data: TeamsOneBattingResponse, column: string): number {
  const index = data.columns.indexOf(column);
  if (index < 0) return 0;
  return data.rows.reduce((total, player) => {
    const value = teamsOneStatNumber(player.values[index]);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function sumPitchingOuts(data: TeamsOneBattingResponse): number {
  const index = data.columns.indexOf("投球回");
  if (index < 0) return 0;
  return data.rows.reduce((outs, player) => {
    const innings = teamsOneStatNumber(player.values[index]);
    return outs + (Number.isFinite(innings) ? Math.round(innings * 3) : 0);
  }, 0);
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("ja-JP");
}

function formatRate(value: number | undefined, digits = 3, omitLeadingZero = true): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const rounded = value.toFixed(digits);
  return omitLeadingZero && value < 1 ? rounded.replace(/^0/, "") : rounded;
}

function playerColumnValue(data: TeamsOneBattingResponse, playerIndex: number, column: string): number {
  const index = data.columns.indexOf(column);
  if (index < 0) return 0;
  const value = teamsOneStatNumber(data.rows[playerIndex]?.values[index]);
  return Number.isFinite(value) ? value : 0;
}

function playerRate(data: TeamsOneBattingResponse, playerIndex: number, label: string, kind: TeamsOneStatsKind): number {
  if (kind === "batting") {
    const atBats = playerColumnValue(data, playerIndex, "打数");
    const hits = playerColumnValue(data, playerIndex, "安打");
    const walks = playerColumnValue(data, playerIndex, "四球");
    const hitByPitch = playerColumnValue(data, playerIndex, "死球");
    const sacrificeFlies = playerColumnValue(data, playerIndex, "犠飛");
    const bases = playerColumnValue(data, playerIndex, "塁打数");
    const onBaseDenominator = atBats + walks + hitByPitch + sacrificeFlies;
    const onBase = onBaseDenominator ? (hits + walks + hitByPitch) / onBaseDenominator : undefined;
    const slugging = atBats ? bases / atBats : undefined;
    if (label === "打率") return atBats ? hits / atBats : NaN;
    if (label === "出塁率") return onBase ?? NaN;
    if (label === "長打率") return slugging ?? NaN;
    if (label === "OPS") return onBase !== undefined && slugging !== undefined ? onBase + slugging : NaN;
    return NaN;
  }

  const innings = playerColumnValue(data, playerIndex, "投球回");
  const wins = playerColumnValue(data, playerIndex, "勝");
  const losses = playerColumnValue(data, playerIndex, "敗");
  const earnedRuns = playerColumnValue(data, playerIndex, "自責点");
  const hitsAllowed = playerColumnValue(data, playerIndex, "被安打");
  const walksAllowed = playerColumnValue(data, playerIndex, "与四球");
  const strikeouts = playerColumnValue(data, playerIndex, "奪三振");
  if (label === "勝率") return wins + losses ? wins / (wins + losses) : NaN;
  if (label === "防御率") return innings ? earnedRuns * 9 / innings : NaN;
  if (label === "WHIP") return innings ? (hitsAllowed + walksAllowed) / innings : NaN;
  if (label === "奪三振率（K/9）") return innings ? strikeouts * 9 / innings : NaN;
  return NaN;
}

export function teamsOneCumulativeLeaders(data: TeamsOneBattingResponse, kind: TeamsOneStatsKind, label: string): CumulativeLeader[] {
  const rateLabels = kind === "batting"
    ? new Set(["打率", "出塁率", "長打率", "OPS"])
    : new Set(["勝率", "防御率", "WHIP", "奪三振率（K/9）"]);
  const isRate = rateLabels.has(label);
  const lowerIsBetter = kind === "pitching" && (label === "防御率" || label === "WHIP");
  return data.rows
    .map((player, index) => {
      const score = isRate ? playerRate(data, index, label, kind) : playerColumnValue(data, index, label);
      return { player, score };
    })
    .filter(({ score }) => Number.isFinite(score) && (isRate || score > 0))
    .sort((a, b) => (lowerIsBetter ? a.score - b.score : b.score - a.score)
      || a.player.number.localeCompare(b.player.number, "ja", { numeric: true }))
    .slice(0, 3)
    .map(({ player, score }) => ({
      id: player.id,
      name: player.name,
      number: player.number,
      value: isRate
        ? formatRate(score, label === "防御率" || label === "WHIP" || label === "奪三振率（K/9）" ? 2 : 3, label !== "防御率" && label !== "WHIP" && label !== "奪三振率（K/9）")
        : kind === "pitching" && label === "投球回"
          ? formatInningsPitched(Math.round(score * 3))
          : formatCount(score),
    }));
}

export function teamsOneCumulativeStats(data: TeamsOneBattingResponse, kind: TeamsOneStatsKind): TeamsOneCumulativeStats {
  const excluded = new Set(kind === "batting"
    ? ["試合数", "打率", "出塁率", "長打率", "得点圏打率", "OPS"]
    : ["試合数", "勝率", "防御率"]);
  const totals = data.columns
    .filter((column) => !excluded.has(column))
    .map((column) => {
      const value = sumColumn(data, column);
      return {
        label: column,
        value: kind === "pitching" && column === "投球回"
          ? formatInningsPitched(sumPitchingOuts(data))
          : formatCount(value),
      };
    });

  if (kind === "batting") {
    const atBats = sumColumn(data, "打数");
    const hits = sumColumn(data, "安打");
    const walks = sumColumn(data, "四球");
    const hitByPitch = sumColumn(data, "死球");
    const sacrificeFlies = sumColumn(data, "犠飛");
    const onBaseDenominator = atBats + walks + hitByPitch + sacrificeFlies;
    const onBase = onBaseDenominator ? (hits + walks + hitByPitch) / onBaseDenominator : undefined;
    const slugging = atBats ? sumColumn(data, "塁打数") / atBats : undefined;
    return {
      rates: [
        { label: "打率", value: formatRate(atBats ? hits / atBats : undefined) },
        { label: "出塁率", value: formatRate(onBase) },
        { label: "長打率", value: formatRate(slugging) },
        { label: "OPS", value: formatRate(onBase !== undefined && slugging !== undefined ? onBase + slugging : undefined) },
      ],
      totals,
    };
  }

  const innings = sumPitchingOuts(data) / 3;
  const wins = sumColumn(data, "勝");
  const losses = sumColumn(data, "敗");
  const runsEarned = sumColumn(data, "自責点");
  const hitsAllowed = sumColumn(data, "被安打");
  const walksAllowed = sumColumn(data, "与四球");
  const strikeouts = sumColumn(data, "奪三振");
  return {
    rates: [
      { label: "勝率", value: formatRate(wins + losses ? wins / (wins + losses) : undefined) },
      { label: "防御率", value: formatRate(innings ? runsEarned * 9 / innings : undefined, 2, false) },
      { label: "WHIP", value: formatRate(innings ? (hitsAllowed + walksAllowed) / innings : undefined, 2, false) },
      { label: "奪三振率（K/9）", value: formatRate(innings ? strikeouts * 9 / innings : undefined, 2, false) },
    ],
    totals,
  };
}
