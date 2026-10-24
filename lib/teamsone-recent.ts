import {
  teamsOneColumns, teamsOneSourceUrl, teamsOneStatNumber,
  type TeamsOneBatter, type TeamsOneBattingTable, type TeamsOneFilters, type TeamsOneStatsKind,
} from "./teamsone-batters";
import { findPersonalBatter } from "./teamsone-personal";

type RecentGame = NonNullable<TeamsOneBattingTable["recentGames"]>[number];
type GamePlayer = { key: string; number: string; name: string; stats: Record<string, number> };
const BATTING_HEADERS = ["#", "選手名", "出場", "打順", "守備", "打席", "打数", "安打", "本", "打点", "得点", "盗塁", "二塁打", "三塁打", "得点圏打数", "得点圏安打", "三振", "四球", "死球", "犠打", "犠飛", "併殺打", "敵失", "失策", "盗塁死", "盗塁阻止"];
const PITCHING_HEADERS = ["#", "選手名", "勝敗", "投球回", "投球数", "失点", "自責点", "完投", "完封", "被安打", "被本塁打", "奪三振", "与四球", "与死球", "ボーク", "暴投", "登板順"];

function text(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&(#x[\da-f]+|#\d+|nbsp|amp|quot|apos|lt|gt);/gi, (_, entity: string) => {
    const named: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? "";
    const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "�";
  }).replace(/\s+/g, " ").trim();
}

/** Only completed official/practice games in the selected current year count.
 * Keep the source order for doubleheaders on the same date. Never follow arbitrary links.
 */
export function parseTeamsOneRecentGames(html: string, year: number, now = new Date()): { games: RecentGame[]; next?: string } {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const games: RecentGame[] = [];
  const items = [...html.matchAll(/<a\b(?=[^>]*\bclass=["'][^"']*\btoDetailLink\b[^"']*["'])(?=[^>]*\bhref=["'](\/teams\/ygfires\/game\/(\d+))["'])[^>]*>([\s\S]*?)<\/a>/gi)];
  if (!items.length && !/該当|試合結果がありません|試合がありません/.test(text(html))) throw new Error("Teams.one game list is missing");
  for (const item of items) {
    const block = item[3];
    const date = /class=["'][^"']*\bdate\b[^"']*["'][^>]*>\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(block);
    const score = /class=["'][^"']*\bscore\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/.exec(block)?.[1];
    const opponentBlock = /class=["'][^"']*\bopponent\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/.exec(block)?.[1] ?? "";
    const type = text(/<span\b[^>]*>([\s\S]*?)<\/span>/.exec(opponentBlock)?.[1] ?? "");
    const result = text(/class=["'][^"']*\bresult\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/.exec(block)?.[1] ?? "");
    if (!date || !/公式戦|練習試合/.test(type) || !/勝|負|敗|引|分/.test(result) || !/^\d+\s*[-−–]\s*\d+$/.test(text(score ?? ""))) continue;
    const key = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
    if (Number(date[1]) !== year || key > today) continue;
    games.push({ id: item[2], date: key, opponent: text(opponentBlock.replace(/<span\b[^>]*>[\s\S]*?<\/span>/, "")), url: `https://teams.one${item[1]}` });
  }
  games.sort((a, b) => b.date.localeCompare(a.date));
  const nextHref = /<a\b(?=[^>]*\brel=["']next["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1];
  let next: string | undefined;
  if (nextHref) {
    const url = new URL(text(nextHref), "https://teams.one");
    if (url.origin !== "https://teams.one" || url.pathname !== "/teams/ygfires/game") throw new Error("Invalid game pagination");
    url.searchParams.set("search_result[game_date]", String(year));
    next = url.toString();
  }
  return { games, next };
}

function count(value: string): number {
  if (/^[-–—ー]$/.test(value)) return 0;
  if (!/^\d{1,7}$/.test(value)) throw new Error("Invalid game statistic");
  return Number(value);
}

export function parseTeamsOneGamePlayers(html: string, kind: TeamsOneStatsKind): GamePlayer[] {
  const table = new RegExp(`<table\\b[^>]*class=["'][^"']*\\bstats_${kind}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/table>`, "i").exec(html)?.[1];
  if (table === undefined) throw new Error("Teams.one game statistics are missing");
  const expected = kind === "pitching" ? PITCHING_HEADERS : BATTING_HEADERS;
  const head = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(table)?.[1] ?? "";
  const headers = [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(cell => text(cell[1]));
  if (headers.length !== expected.length || headers.some((label, index) => label !== expected[index])) throw new Error("Game statistic columns changed");
  const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(table)?.[1];
  if (body === undefined) throw new Error("Game statistic body is missing");
  const players: GamePlayer[] = [];
  for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => cell[1]);
    if (cells.length !== expected.length) throw new Error("Game statistic row changed");
    const values = cells.map(text);
    if (!/^(?:\d{1,3}|-)$/.test(values[0]) || !values[1] || values[1].length > 100) throw new Error("Invalid game player");
    if (kind === "batting" && /控え|不出場|未出場/.test(values[2])) continue;
    const id = /href=["']\/teams\/ygfires\/player\/(\d+)["']/.exec(cells[1])?.[1];
    const stats: Record<string, number> = {};
    for (let index = kind === "pitching" ? 3 : 5; index < expected.length; index++) {
      const column = expected[index] === "本" ? "本塁打" : expected[index];
      if (column === "登板順") continue;
      if (column === "投球回") {
        const innings = /^(\d{1,3})\s*回\s*([012])\s*\/\s*3$/.exec(values[index]);
        if (!innings) throw new Error("Invalid game innings");
        stats.outs = Number(innings[1]) * 3 + Number(innings[2]);
      } else if (column === "完投" || column === "完封") {
        stats[column] = /^[○〇◯●✓✔]$/.test(values[index]) ? 1 : count(values[index]);
      } else stats[column] = count(values[index]);
    }
    if (kind === "pitching") {
      if (!/^(?:勝|敗|負|H|S|ホールド|セーブ|[-–—ー])$/.test(values[2])) throw new Error("Invalid pitcher result");
      stats["勝"] = Number(values[2] === "勝");
      stats["敗"] = Number(/敗|負/.test(values[2]));
      stats["ホールド"] = Number(/H|ホールド/.test(values[2]));
      stats["セーブ"] = Number(/S|セーブ/.test(values[2]));
    }
    players.push({ key: id ? `player:${id}` : `guest:${values[0]}:${values[1].normalize("NFKC").replace(/\s/g, "")}`, number: values[0], name: values[1], stats });
    if (players.length > 250) throw new Error("Too many game players");
  }
  if (!players.length) throw new Error("Individual game statistics have not been published");
  return players;
}

function rate(numerator: number, denominator: number, digits = 3): string {
  return denominator ? (numerator / denominator).toFixed(digits).replace(/^0\./, ".") : ".000";
}

/** Teams may configure the ERA inning base. Infer it only when the published
 * annual ERA, earned runs and innings determine a unique whole-number base.
 */
function earnedRunBase(rows: TeamsOneBatter[]): number {
  const columns = teamsOneColumns("pitching");
  const samples = rows.map(row => ({ era: teamsOneStatNumber(row.values[columns.indexOf("防御率")]),
    runs: teamsOneStatNumber(row.values[columns.indexOf("自責点")]), innings: teamsOneStatNumber(row.values[columns.indexOf("投球回")]) }))
    .filter(row => Number.isFinite(row.era) && row.runs > 0 && row.innings > 0);
  const candidates = Array.from({ length: 20 }, (_, index) => index + 1).filter(base => samples.length && samples.every(row => Math.abs(row.era - row.runs * base / row.innings) < .011));
  if (candidates.length !== 1) throw new Error("Cannot determine the team's ERA inning base");
  return candidates[0];
}

export function aggregateTeamsOneRecentStats(base: TeamsOneBattingTable, games: RecentGame[], players: GamePlayer[][], unreached: boolean): TeamsOneBattingTable {
  if (games.length !== players.length || games.length > 5) throw new Error("Incomplete recent game statistics");
  const sums = new Map<string, GamePlayer>();
  for (const game of players) {
    const seen = new Set<string>();
    for (const row of game) {
      let sum = sums.get(row.key);
      if (!sum) { sum = { ...row, stats: {} }; sums.set(row.key, sum); }
      for (const [column, value] of Object.entries(row.stats)) sum.stats[column] = (sum.stats[column] ?? 0) + value;
      if (!seen.has(row.key)) sum.stats["試合数"] = (sum.stats["試合数"] ?? 0) + 1;
      seen.add(row.key);
    }
  }
  const included = [...sums.values()].filter(player => unreached || !!findPersonalBatter(base.rows, player).player);
  const eraBase = base.kind === "pitching" && included.some(row => row.stats["自責点"] > 0 && row.stats.outs > 0) ? earnedRunBase(base.rows) : 0;
  const rows = included.map(player => {
    const n = (column: string) => player.stats[column] ?? 0;
    const atBats = n("打数"), hits = n("安打"), walks = n("四球"), hbp = n("死球");
    const totalBases = hits + n("二塁打") + 2 * n("三塁打") + 3 * n("本塁打");
    const obpDenominator = atBats + walks + hbp + n("犠飛");
    const values = teamsOneColumns(base.kind).map(column => {
      switch (column) {
        case "打率": return rate(hits, atBats);
        case "出塁率": return rate(hits + walks + hbp, obpDenominator);
        case "長打率": return rate(totalBases, atBats);
        case "得点圏打率": return rate(n("得点圏安打"), n("得点圏打数"));
        case "OPS": return rate((obpDenominator ? (hits + walks + hbp) / obpDenominator : 0) + (atBats ? totalBases / atBats : 0), 1);
        case "塁打数": return String(totalBases);
        case "勝率": return rate(n("勝"), n("勝") + n("敗"));
        case "防御率": return n("outs") ? (n("自責点") * eraBase * 3 / n("outs")).toFixed(2) : n("自責点") ? "—" : "0.00";
        case "投球回": return `${Math.floor(n("outs") / 3)}回${n("outs") % 3}/3`;
        default: return String(n(column));
      }
    });
    return { id: `${player.number}:${player.name}`, name: player.name, number: player.number, values };
  });
  return { ...base, season: "直近5試合", rows, recentGames: games };
}

export async function loadTeamsOneRecentStats(base: TeamsOneBattingTable, filters: TeamsOneFilters, readHtml: (url: string) => Promise<string>, now = new Date()): Promise<TeamsOneBattingTable> {
  const games: RecentGame[] = [];
  const visited = new Set<string>();
  let url: string | undefined = teamsOneSourceUrl({ ...filters, recent5: true });
  for (let page = 0; url && games.length < 5; page++) {
    if (page >= 3 || visited.has(url)) throw new Error("Recent games exceed pagination limit");
    visited.add(url);
    const parsed = parseTeamsOneRecentGames(await readHtml(url), Number(filters.year), now);
    for (const game of parsed.games) if (!games.some(existing => existing.id === game.id) && games.length < 5) games.push(game);
    url = parsed.next;
  }
  const players: GamePlayer[][] = new Array(games.length);
  let cursor = 0;
  await Promise.all([0, 1].map(async () => {
    while (cursor < games.length) {
      const index = cursor++;
      players[index] = parseTeamsOneGamePlayers(await readHtml(games[index].url), base.kind);
    }
  }));
  return aggregateTeamsOneRecentStats(base, games, players, !!filters.unreached);
}
