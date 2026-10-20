export const TEAMS_ONE_BATTERS_URL = "https://teams.one/teams/ygfires/stats/batters_table";
export const TEAMS_ONE_BATTERS_FRESH_MS = 15 * 60 * 1000;
export const TEAMS_ONE_BATTERS_COLUMNS = [
  "試合数", "打率", "打席", "打数", "安打", "本塁打", "打点", "得点", "盗塁", "出塁率", "長打率", "得点圏打率", "OPS",
  "二塁打", "三塁打", "塁打数", "三振", "四球", "死球", "犠打", "犠飛", "併殺打", "敵失", "失策", "盗塁死", "盗塁阻止",
] as const;

export type TeamsOneGameType = "" | "official" | "practice";
export type TeamsOneFilters = { year: number | "all"; gameType: TeamsOneGameType; unreached?: boolean };
export const TEAMS_ONE_GAME_TYPES = [
  { value: "", label: "試合属性" }, { value: "official", label: "公式戦" }, { value: "practice", label: "練習試合" },
] as const;

export function teamsOneCurrentYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric" }).format(now));
}

export function teamsOneYears(now = new Date()): number[] {
  return Array.from({ length: Math.max(0, teamsOneCurrentYear(now) - 2022 + 1) }, (_, index) => 2022 + index);
}

export function parseTeamsOneFilters(requestUrl: string, now = new Date()): TeamsOneFilters {
  const params = new URL(requestUrl).searchParams;
  const year = params.get("year") ?? String(teamsOneCurrentYear(now));
  const gameType = params.get("gameType") ?? "";
  const unreached = params.get("unreached");
  if (year !== "all" && (!/^\d{4}$/.test(year) || Number(year) < 2022 || Number(year) > teamsOneCurrentYear(now))
    || !TEAMS_ONE_GAME_TYPES.some(option => option.value === gameType)
    || unreached !== null && unreached !== "true" && unreached !== "false") throw new Error("Invalid Teams.one filters");
  return { year: year === "all" ? "all" : Number(year), gameType: gameType as TeamsOneGameType, ...(unreached === "true" ? { unreached: true } : {}) };
}

export function teamsOneSourceUrl({ year, gameType, unreached }: TeamsOneFilters): string {
  const url = new URL(TEAMS_ONE_BATTERS_URL);
  url.searchParams.set("search_result[game_date]", year === "all" ? "" : String(year));
  if (unreached) url.searchParams.set("search_result[unreached]", "true");
  url.searchParams.set("search_result[game_type]", gameType);
  return url.toString();
}

export type TeamsOneBatter = { id: string; number: string; name: string; values: string[] };
export type TeamsOneBattingTable = { season: string; gameType: TeamsOneGameType; columns: string[]; rows: TeamsOneBatter[] };
export type TeamsOneBattingSnapshot = TeamsOneBattingTable & { source: string; fetchedAt: string };
export type TeamsOneBattingResponse = TeamsOneBattingSnapshot & { stale: boolean };

function textContent(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[\da-f]+|#\d+|nbsp|amp|quot|apos|lt|gt);/gi, (entity, name: string) => {
      const named: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
      if (name[0] !== "#") return named[name.toLowerCase()] ?? entity;
      const point = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "�";
    })
    .replace(/\s+/g, " ").trim();
}

/** Read only the published table; never execute or embed upstream HTML. */
export function parseTeamsOneBatters(html: string): TeamsOneBattingTable {
  if (html.length > 512_000) throw new Error("Teams.one response is too large");
  const yearSelect = /<select\b[^>]*\bid=["']search_result_game_date["'][^>]*>([\s\S]*?)<\/select>/i.exec(html)?.[1];
  if (!yearSelect) throw new Error("Teams.one season selector is missing");
  const yearOptions = [...yearSelect.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
  const selected = yearOptions.find(option => /\bselected(?:\s*=|\s|$)/i.test(option[1])) ?? yearOptions[0];
  if (!selected) throw new Error("Teams.one selected season is missing");
  const year = /\bvalue=["']([^"']*)["']/i.exec(selected[1])?.[1];
  if (year !== "" && !/^\d{4}$/.test(year ?? "")) throw new Error("Teams.one season is invalid");
  const typeSelect = /<select\b[^>]*\bid=["']search_result_game_type["'][^>]*>([\s\S]*?)<\/select>/i.exec(html)?.[1];
  if (!typeSelect) throw new Error("Teams.one game type selector is missing");
  const selectedType = [...typeSelect.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    .find(option => /\bselected(?:\s*=|\s|$)/i.test(option[1]));
  const gameType = selectedType ? /\bvalue=["']([^"']*)["']/i.exec(selectedType[1])?.[1] : "";
  if (!TEAMS_ONE_GAME_TYPES.some(option => option.value === gameType)) throw new Error("Teams.one game type is invalid");
  const expected = ["背番号", ...TEAMS_ONE_BATTERS_COLUMNS];

  for (const match of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const head = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(match[1])?.[1] ?? "";
    const labels = [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
      .map(cell => textContent(cell[1]).replace(/\s/g, ""));
    if (labels[0] !== "背番号") continue;
    if (labels.length !== expected.length || labels.some((label, index) => label !== expected[index])) {
      throw new Error("Teams.one batting columns have changed");
    }
    const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(match[1])?.[1];
    if (body === undefined) throw new Error("Teams.one batting table body is missing");
    const rows: TeamsOneBatter[] = [];
    const ids = new Set<string>();
    for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => textContent(cell[1]));
      if (cells.length !== expected.length) throw new Error("Teams.one batting row has changed");
      const numbered = /^(\d{1,3}|-)\s+(.+)$/.exec(cells[0]);
      // Some published players have no jersey number (only a name in this cell).
      const player = numbered ?? (cells[0] && !/^\d/.test(cells[0]) ? [cells[0], "-", cells[0]] : null);
      if (!player || player[2].length > 100) throw new Error("Teams.one player is invalid");
      const values = cells.slice(1).map(value => value || "-");
      if (values.some(value => value.length > 32 || !/^(?:\d[\d,]*(?:\.\d+)?|\.\d+|[-–—]+)$/.test(value))) {
        throw new Error("Teams.one batting value is invalid");
      }
      const id = `${player[1]}:${player[2]}`;
      if (ids.has(id) || rows.length >= 250) throw new Error("Teams.one player list is invalid");
      ids.add(id);
      rows.push({ id, number: player[1], name: player[2], values });
    }
    return { season: year || "通算", gameType: gameType as TeamsOneGameType, columns: [...TEAMS_ONE_BATTERS_COLUMNS], rows };
  }
  throw new Error("Teams.one batting table is missing");
}

export function sortTeamsOneBatters(rows: TeamsOneBatter[], column: number, descending: boolean): TeamsOneBatter[] {
  return [...rows].sort((a, b) => {
    if (column === -1) return (descending ? -1 : 1) * a.number.localeCompare(b.number, "ja", { numeric: true });
    const aValue = Number(a.values[column]?.replaceAll(",", ""));
    const bValue = Number(b.values[column]?.replaceAll(",", ""));
    if (!Number.isFinite(aValue)) return Number.isFinite(bValue) ? 1 : 0;
    if (!Number.isFinite(bValue)) return -1;
    return (descending ? -1 : 1) * (aValue - bValue);
  });
}
