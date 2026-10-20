import { TEAMS_ONE_BATTERS_COLUMNS, type TeamsOneBatter } from "./teamsone-batters";

export const PERSONAL_BATTING_METRICS = [
  ["打率", "打率"], ["本塁打", "HR"], ["打点", "打点"], ["盗塁", "盗塁"], ["得点", "得点"],
  ["出塁率", "出塁率"], ["長打率", "長打率"], ["得点圏打率", "得点圏打率"], ["OPS", "OPS"],
  ["安打", "安打"], ["二塁打", "二塁打"], ["三塁打", "三塁打"], ["四球", "四球"], ["死球", "死球"],
  ["三振", "三振"], ["犠打", "犠打"], ["犠飛", "犠飛"], ["併殺打", "併殺打"], ["失策", "失策"],
  ["盗塁阻止", "盗塁阻止"], ["試合数", "試合数"],
] as const;

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

export function personalMetricValue(player: TeamsOneBatter | undefined, column: typeof TEAMS_ONE_BATTERS_COLUMNS[number]): string {
  return player?.values[TEAMS_ONE_BATTERS_COLUMNS.indexOf(column)] ?? "—";
}

/** Descending competition ranks: equal values share a rank (1, 1, 3).
 * All published teammates participate, including players below qualification.
 * A zero result is ineligible for a crown, including rates such as .000.
 */
export function personalMetricRank(rows: TeamsOneBatter[], player: TeamsOneBatter | undefined, column: typeof TEAMS_ONE_BATTERS_COLUMNS[number]): number | undefined {
  if (!player) return undefined;
  const index = TEAMS_ONE_BATTERS_COLUMNS.indexOf(column);
  const numeric = (row: TeamsOneBatter) => {
    const value = row.values[index]?.trim().replaceAll(",", "");
    return value ? Number(value) : NaN;
  };
  const published = rows.find(row => row.id === player.id);
  if (!published) return undefined;
  const value = numeric(published);
  if (!Number.isFinite(value) || value === 0) return undefined;
  return 1 + rows.filter(row => {
    const other = numeric(row);
    return Number.isFinite(other) && other > value;
  }).length;
}
