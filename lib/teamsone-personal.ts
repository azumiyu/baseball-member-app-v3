import { teamsOneColumns, teamsOneStatNumber, type TeamsOneBatter, type TeamsOneStatsKind } from "./teamsone-batters";

export const PERSONAL_BATTING_METRICS = [
  ["打率", "打率"], ["本塁打", "HR"], ["打点", "打点"], ["盗塁", "盗塁"], ["得点", "得点"],
  ["出塁率", "出塁率"], ["長打率", "長打率"], ["得点圏打率", "得点圏打率"], ["OPS", "OPS"],
  ["安打", "安打"], ["二塁打", "二塁打"], ["三塁打", "三塁打"], ["四球", "四球"], ["死球", "死球"],
  ["三振", "三振"], ["犠打", "犠打"], ["犠飛", "犠飛"], ["併殺打", "併殺打"], ["失策", "失策"],
  ["盗塁阻止", "盗塁阻止"], ["試合数", "試合数"],
] as const;
export const PERSONAL_PITCHING_METRICS = [
  ["勝", "勝ち数"], ["勝率", "勝率"], ["防御率", "防御率"], ["ホールド", "ホールド"], ["セーブ", "セーブ"],
  ["奪三振", "奪三振"], ["投球回", "投球回"], ["完封", "完封"], ["試合数", "試合数"],
] as const;

export function personalMetricRequiresQualification(column: string, kind: TeamsOneStatsKind = "batting"): boolean {
  return (kind === "pitching" ? ["勝率", "防御率"] : ["打率", "出塁率", "長打率", "得点圏打率", "OPS"]).includes(column);
}

const normalizeName = (value: string) => value.normalize("NFKC").replace(/\s/g, "");
const normalizeNumber = (value: string) => value.normalize("NFKC").replace(/^0+(?=\d)/, "");

/** Names are required: jersey numbers can belong to different players over time. */
export function findPersonalBatter(rows: TeamsOneBatter[], member: { name: string; number: string }): {
  player?: TeamsOneBatter; ambiguous: boolean;
} {
  const name = normalizeName(member.name);
  if (!name) return { ambiguous: false };
  const matches = rows.filter(row => normalizeName(row.name) === name);
  if (matches.length === 1) return { player: matches[0], ambiguous: false };
  const exact = matches.filter(row => normalizeNumber(row.number) === normalizeNumber(member.number));
  return exact.length === 1 ? { player: exact[0], ambiguous: false } : { ambiguous: matches.length > 1 };
}

export function personalMetricValue(player: TeamsOneBatter | undefined, column: string, kind: TeamsOneStatsKind = "batting"): string {
  return player?.values[teamsOneColumns(kind).indexOf(column)] ?? "—";
}

/** Competition ranks: equal values share a rank (1, 1, 3). Pitching ERA ranks ascending;
 * all other columns rank descending, including innings with fractional outs.
 * Callers select the ranking pool using personalMetricRequiresQualification.
 * A zero result is ineligible for a crown, including rates such as .000.
 */
export function personalMetricRank(rows: TeamsOneBatter[], player: TeamsOneBatter | undefined, column: string, kind: TeamsOneStatsKind = "batting"): number | undefined {
  if (!player) return undefined;
  const index = teamsOneColumns(kind).indexOf(column);
  const numeric = (row: TeamsOneBatter) => teamsOneStatNumber(row.values[index]);
  const published = rows.find(row => row.id === player.id);
  if (!published) return undefined;
  const displayedValue = numeric(player);
  if (!Number.isFinite(displayedValue) || displayedValue === 0) return undefined;
  const value = numeric(published);
  if (!Number.isFinite(value) || value === 0) return undefined;
  return 1 + rows.filter(row => {
    const other = numeric(row);
    return Number.isFinite(other) && (kind === "pitching" && column === "防御率" ? other < value : other > value);
  }).length;
}

export type PersonalMetricStanding = {
  player: TeamsOneBatter;
  rank?: number;
  isSelf: boolean;
  gap?: string;
};

/** Show exactly three players from the selected pool, prioritizing the member within a tie.
 * Missing values cannot rank; zero values can rank here but still earn no crown.
 */
export function personalMetricLeaderboard(rows: TeamsOneBatter[], player: TeamsOneBatter | undefined, column: string, kind: TeamsOneStatsKind = "batting"): {
  leaders: PersonalMetricStanding[]; personal?: PersonalMetricStanding; eligible: boolean;
} {
  const index = teamsOneColumns(kind).indexOf(column);
  const numeric = (row: TeamsOneBatter) => teamsOneStatNumber(row.values[index]);
  const published = player && rows.find(row => row.id === player.id);
  const self = published ?? player;
  const ascending = kind === "pitching" && column === "防御率";
  const better = (a: number, b: number) => ascending ? a < b : a > b;
  const pool = rows.filter(row => Number.isFinite(numeric(row)));
  const rank = (row: TeamsOneBatter) => Number.isFinite(numeric(row))
    ? 1 + pool.filter(other => better(numeric(other), numeric(row))).length : undefined;
  const sorted = [...pool].sort((a, b) => {
    const difference = numeric(a) - numeric(b);
    if (difference) return ascending ? difference : -difference;
    const memberOrder = Number(b.id === self?.id) - Number(a.id === self?.id);
    if (memberOrder) return memberOrder;
    const jersey = (row: TeamsOneBatter) => /^\d+$/.test(row.number.normalize("NFKC")) ? Number(row.number.normalize("NFKC")) : Infinity;
    return (jersey(a) - jersey(b) || 0) || a.number.localeCompare(b.number, "ja", { numeric: true }) || a.id.localeCompare(b.id, "ja");
  });
  const leaders = sorted.slice(0, 3).map(row => {
    const difference = self ? Math.abs(numeric(row) - numeric(self)) : NaN;
    const gap = published && self && better(numeric(row), numeric(self)) && Number.isFinite(difference)
      ? personalMetricGap(difference, column) : undefined;
    return { player: row, rank: rank(row), isSelf: row.id === self?.id, gap };
  });
  const personal = self && !leaders.some(row => row.isSelf)
    ? { player: self, rank: published ? rank(self) : undefined, isSelf: true } : undefined;
  return { leaders, personal, eligible: !!published };
}

function personalMetricGap(difference: number, column: string): string {
  if (column === "投球回") {
    const outs = Math.round(difference * 3);
    return `あと${Math.floor(outs / 3)}回${outs % 3 ? `${outs % 3}/3` : ""}`;
  }
  const precision = column === "防御率" ? 2 : ["打率", "出塁率", "長打率", "得点圏打率", "OPS", "勝率"].includes(column) ? 3 : 0;
  const unit = ["本塁打", "安打", "二塁打", "三塁打"].includes(column) ? "本"
    : ["打点", "得点"].includes(column) ? "点" : column === "試合数" ? "試合" : "";
  return `あと${difference.toFixed(precision)}${unit}`;
}
