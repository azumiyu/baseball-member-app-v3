import { teamsOneColumns, teamsOneStatNumber, type TeamsOneBatter, type TeamsOneStatsKind } from "./teamsone-batters";

export const PERSONAL_BATTING_METRICS = [
  ["打率", "打率"], ["本塁打", "HR"], ["打点", "打点"], ["盗塁", "盗塁"], ["得点", "得点"],
  ["出塁率", "出塁率"], ["長打率", "長打率"], ["得点圏打率", "得点圏打率"], ["OPS", "OPS"],
  ["安打", "安打"], ["二塁打", "二塁打"], ["三塁打", "三塁打"], ["四球", "四球"], ["死球", "死球"],
  ["三振", "三振"], ["犠打", "犠打"], ["犠飛", "犠飛"], ["併殺打", "併殺打"], ["失策", "失策"],
  ["盗塁阻止", "盗塁阻止"], ["試合数", "試合数"],
  ["ISO", "ISO"], ["BABIP", "BABIP"], ["BB/K", "BB/K"], ["BB%", "BB%"], ["K%", "K%"], ["PA/HR", "PA/HR"],
] as const;
export const PERSONAL_PITCHING_METRICS = [
  ["勝", "勝ち数"], ["勝率", "勝率"], ["防御率", "防御率"], ["ホールド", "ホールド"], ["セーブ", "セーブ"],
  ["奪三振", "奪三振"], ["投球回", "投球回"], ["完封", "完封"], ["試合数", "試合数"],
  ["WHIP", "WHIP"], ["K/9", "K/9"], ["BB/9", "BB/9"], ["K/BB", "K/BB"], ["H/9", "H/9"],
  ["HR/9", "HR/9"], ["HBP/9", "HBP/9"], ["RA/9", "RA/9"], ["投球数/回", "投球数/回"],
] as const;

export function personalMetricRequiresQualification(column: string, kind: TeamsOneStatsKind = "batting"): boolean {
  return (kind === "pitching"
    ? ["勝率", "防御率", "WHIP", "K/9", "BB/9", "K/BB", "H/9", "HR/9", "HBP/9", "RA/9", "投球数/回"]
    : ["打率", "出塁率", "長打率", "得点圏打率", "OPS", "ISO", "BABIP", "BB/K", "BB%", "K%", "PA/HR"]
  ).includes(column);
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
  if (!player) return "—";
  const sourceIndex = teamsOneColumns(kind).indexOf(column);
  if (sourceIndex >= 0) return player.values[sourceIndex] ?? "—";
  const value = personalMetricNumber(player, column, kind);
  if (!Number.isFinite(value)) return "—";
  if (["ISO", "BABIP", "BB%", "K%"].includes(column)) {
    const rounded = value.toFixed(3);
    return value >= 0 && value < 1 ? rounded.slice(1) : rounded;
  }
  if (["BB/K", "PA/HR"].includes(column)) return value.toFixed(2);
  if (kind === "pitching" && ["WHIP", "K/9", "BB/9", "K/BB", "H/9", "HR/9", "HBP/9", "RA/9", "投球数/回"].includes(column)) return value.toFixed(2);
  return "—";
}

/** Return source or derived numeric values. Rates without a valid denominator are not ranked. */
function personalMetricNumber(player: TeamsOneBatter, column: string, kind: TeamsOneStatsKind): number {
  const columns = teamsOneColumns(kind);
  const source = (name: string) => teamsOneStatNumber(player.values[columns.indexOf(name)]);
  const ratio = (numerator: number, denominator: number, scale = 1) =>
    Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator * scale / denominator : NaN;

  const sourceIndex = columns.indexOf(column);
  if (sourceIndex >= 0) return teamsOneStatNumber(player.values[sourceIndex]);
  if (kind === "batting") {
    const plateAppearances = source("打席");
    const atBats = source("打数");
    const hits = source("安打");
    const homeRuns = source("本塁打");
    const walks = source("四球");
    const strikeouts = source("三振");
    switch (column) {
      case "ISO": return ratio(source("塁打数") - hits, atBats);
      case "BABIP": return ratio(hits - homeRuns, atBats - strikeouts - homeRuns + source("犠飛"));
      case "BB/K": return ratio(walks, strikeouts);
      case "BB%": return ratio(walks, plateAppearances);
      case "K%": return ratio(strikeouts, plateAppearances);
      case "PA/HR": return ratio(plateAppearances, homeRuns);
      default: return NaN;
    }
  }

  const innings = source("投球回");
  const hitsAllowed = source("被安打");
  const homeRunsAllowed = source("被本塁打");
  const strikeouts = source("奪三振");
  const walks = source("与四球");
  const hitBatters = source("与死球");
  switch (column) {
    case "WHIP": return ratio(hitsAllowed + walks, innings);
    case "K/9": return ratio(strikeouts, innings, 9);
    case "BB/9": return ratio(walks, innings, 9);
    case "K/BB": return ratio(strikeouts, walks);
    case "H/9": return ratio(hitsAllowed, innings, 9);
    case "HR/9": return ratio(homeRunsAllowed, innings, 9);
    case "HBP/9": return ratio(hitBatters, innings, 9);
    case "RA/9": return ratio(source("失点"), innings, 9);
    case "投球数/回": return ratio(source("投球数"), innings);
    default: return NaN;
  }
}

/** Lower values lead for strikeout rate, home run rate, and other efficiency metrics. */
export function personalMetricLowerIsBetter(column: string, kind: TeamsOneStatsKind = "batting"): boolean {
  return kind === "pitching"
    ? ["防御率", "WHIP", "BB/9", "H/9", "HR/9", "HBP/9", "RA/9", "投球数/回"].includes(column)
    : ["K%", "PA/HR"].includes(column);
}

export function personalMetricDescription(column: string): string | undefined {
  const descriptions: Record<string, string> = {
    ISO: "長打率から打率を引いた値です。二塁打以上による長打力の目安になります。",
    BABIP: "本塁打と三振を除く打球が安打になった割合です。守備や運の影響も受けます。",
    "BB/K": "四球数を三振数で割った値です。高いほど、三振に対して四球を多く選んでいます。",
    "BB%": "打席のうち四球になった割合です。",
    "K%": "打席のうち三振になった割合です。低いほど三振が少ないことを示します。",
    "PA/HR": "本塁打1本にかかった打席数です。低いほど少ない打席で本塁打が出ています。",
    WHIP: "1イニングあたりに許した安打と四球の合計です。死球は含みません。低いほど走者を出していません。",
    "K/9": "9イニングあたりの奪三振数です。",
    "BB/9": "9イニングあたりに与えた四球数です。低いほど四球を抑えています。",
    "K/BB": "奪三振数を与四球数で割った値です。高いほど四球に対して三振を多く取っています。",
    "H/9": "9イニングあたりに許した安打数です。",
    "HR/9": "9イニングあたりに許した本塁打数です。",
    "HBP/9": "9イニングあたりに与えた死球数です。",
    "RA/9": "9イニングあたりの失点数です。自責点以外の失点も含みます。",
    "投球数/回": "1イニングあたりの投球数です。少ないほど効率よくアウトを取っています。",
  };
  return descriptions[column];
}

/** Competition ranks: equal values share a rank (1, 1, 3). Lower-is-better metrics rank ascending;
 * all other columns rank descending, including innings with fractional outs.
 * Callers select the ranking pool using personalMetricRequiresQualification.
 * A zero result is ineligible for a crown, including rates such as .000.
 */
export function personalMetricRank(rows: TeamsOneBatter[], player: TeamsOneBatter | undefined, column: string, kind: TeamsOneStatsKind = "batting"): number | undefined {
  if (!player) return undefined;
  const numeric = (row: TeamsOneBatter) => personalMetricNumber(row, column, kind);
  const published = rows.find(row => row.id === player.id);
  if (!published) return undefined;
  const displayedValue = numeric(player);
  if (!Number.isFinite(displayedValue) || displayedValue === 0) return undefined;
  const value = numeric(published);
  if (!Number.isFinite(value) || value === 0) return undefined;
  return 1 + rows.filter(row => {
    const other = numeric(row);
    return Number.isFinite(other) && (personalMetricLowerIsBetter(column, kind) ? other < value : other > value);
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
  const numeric = (row: TeamsOneBatter) => personalMetricNumber(row, column, kind);
  const published = player && rows.find(row => row.id === player.id);
  const self = published ?? player;
  const ascending = personalMetricLowerIsBetter(column, kind);
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
  const precision = ["防御率", "WHIP", "K/9", "BB/9", "K/BB", "H/9", "HR/9", "HBP/9", "RA/9", "投球数/回", "BB/K", "PA/HR"].includes(column) ? 2
    : ["打率", "出塁率", "長打率", "得点圏打率", "OPS", "勝率", "ISO", "BABIP", "BB%", "K%"].includes(column) ? 3 : 0;
  const unit = ["本塁打", "安打", "二塁打", "三塁打"].includes(column) ? "本"
    : ["打点", "得点"].includes(column) ? "点" : column === "試合数" ? "試合" : "";
  return `あと${difference.toFixed(precision)}${unit}`;
}
