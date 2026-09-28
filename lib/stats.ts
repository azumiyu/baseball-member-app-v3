import type { ScheduleGame } from "./schedule";

export const PLATE_APPEARANCE_RESULTS = [
  "安打", "二塁打", "三塁打", "本塁打", "凡退", "三振", "四球", "死球", "犠打", "犠飛", "併殺打", "敵失", "エンドラン",
] as const;

export type PlateAppearanceResult = (typeof PLATE_APPEARANCE_RESULTS)[number];
export type PlayerStats = {
  plateAppearances: Array<PlateAppearanceResult | null>;
  scoringPosition: Array<boolean | null>;
  rbis: number;
  runs: number;
  stolenBases: number;
  caughtStealingAttempts: number;
  errors: number;
  caughtStealing: number;
};
export type GameStats = Record<string, PlayerStats>;
export type StatsData = { games: Record<string, GameStats>; scheduleIds: Record<string, string> };
export type StatsScheduleOption = Pick<ScheduleGame, "id" | "date" | "startTime" | "title" | "opponent" | "location">;
export type StatsSchedulePage = {
  schedules: StatsScheduleOption[];
  hasMoreSchedules: boolean;
  nextScheduleCursor: { date: string; id: string } | null;
};

/** 日付は既存成績の保存キーとして残し、予定との対応は変更されない ID で管理する。 */
export function statsGameKeyForSchedule(data: StatsData, game: StatsScheduleOption): string {
  const existing = Object.keys(data.games).find((key) => data.scheduleIds[key] === game.id);
  if (existing) return existing;
  let number = 1;
  while (Object.hasOwn(data.games, gameKey(game.date, number))) number += 1;
  return gameKey(game.date, number);
}

export function gameKey(gameDate: string, gameNumber: number): string {
  return `${gameDate}|${gameNumber}`;
}

export function parseGameKey(key: string): { date: string; number: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})\|(\d+)$/.exec(key);
  if (!match) return null;
  const number = Number(match[2]);
  return Number.isSafeInteger(number) && number > 0 ? { date: match[1], number } : null;
}

export function emptyPlayerStats(): PlayerStats {
  return { plateAppearances: Array(5).fill(null), scoringPosition: Array(5).fill(false), rbis: 0, runs: 0, stolenBases: 0, caughtStealingAttempts: 0, errors: 0, caughtStealing: 0 };
}

export function todayLocalDate(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function initialStatsData(): StatsData { return { games: {}, scheduleIds: {} }; }

function normalizePlayers(value: unknown): GameStats {
  const players: GameStats = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return players;
  for (const [playerId, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Partial<PlayerStats>;
    const stats = emptyPlayerStats();
    const appearances = source.plateAppearances;
    stats.plateAppearances = Array.isArray(appearances)
      ? Array.from({ length: Math.max(5, appearances.length) }, (_, index) => {
        const result = appearances[index];
        return typeof result === "string" && PLATE_APPEARANCE_RESULTS.includes(result) ? result : null;
      })
      : Array(5).fill(null);
    const scoringPosition = source.scoringPosition;
    stats.scoringPosition = Array.from({ length: stats.plateAppearances.length }, (_, index) => {
      const value = Array.isArray(scoringPosition) ? scoringPosition[index] : null;
      return typeof value === "boolean" ? value : false;
    });
    for (const field of ["rbis", "runs", "stolenBases", "caughtStealingAttempts", "errors", "caughtStealing"] as const) {
      const candidate = source[field];
      stats[field] = typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : 0;
    }
    players[String(playerId)] = stats;
  }
  return players;
}

export function normalizeStatsData(value: unknown): StatsData {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const games: Record<string, GameStats> = {};
  if (source.games && typeof source.games === "object" && !Array.isArray(source.games)) {
    for (const [key, game] of Object.entries(source.games)) {
      const parsed = parseGameKey(key) ?? (/^\d{4}-\d{2}-\d{2}$/.test(key) ? { date: key, number: 1 } : null);
      if (parsed) games[gameKey(parsed.date, parsed.number)] = normalizePlayers(game);
    }
  }
  // 旧形式の { gameDate, players } を一度だけ試合別形式へ移行する。
  if (Object.keys(games).length === 0 && typeof source.gameDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.gameDate)) {
    games[gameKey(source.gameDate, 1)] = normalizePlayers(source.players);
  }
  const scheduleIds: Record<string, string> = {};
  if (source.scheduleIds && typeof source.scheduleIds === "object" && !Array.isArray(source.scheduleIds)) {
    for (const [key, id] of Object.entries(source.scheduleIds)) {
      if (Object.hasOwn(games, key) && typeof id === "string" && id.trim()) scheduleIds[key] = id;
    }
  }
  return { games, scheduleIds };
}

export function validateStatsData(value: unknown): StatsData {
  const normalized = normalizeStatsData(value);
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!source.games || typeof source.games !== "object" || Array.isArray(source.games)) throw new Error("Invalid games");
  if (!source.scheduleIds || typeof source.scheduleIds !== "object" || Array.isArray(source.scheduleIds)) throw new Error("Schedule links are required");
  const linkedIds = new Set<string>();
  for (const [key, id] of Object.entries(source.scheduleIds)) {
    if (!Object.hasOwn(source.games, key) || typeof id !== "string" || !id || id.trim() !== id || id.length > 100 || linkedIds.has(id)) throw new Error("Invalid schedule link");
    linkedIds.add(id);
  }
  const games: Record<string, GameStats> = {};
  for (const [key, rawGame] of Object.entries(source.games)) {
    const parsed = parseGameKey(key);
    if (!parsed || gameKey(parsed.date, parsed.number) !== key) throw new Error("Invalid game key");
    if (!rawGame || typeof rawGame !== "object" || Array.isArray(rawGame)) throw new Error("Invalid game");
    const game: GameStats = {};
    for (const [playerId, raw] of Object.entries(rawGame)) {
      if (!playerId || !raw || typeof raw !== "object") throw new Error("Invalid player stats");
      const sourcePlayer = raw as Partial<PlayerStats>;
      const appearances = sourcePlayer.plateAppearances;
      if (!Array.isArray(appearances) || appearances.length < 5 || appearances.some((result) => result !== null && (typeof result !== "string" || !PLATE_APPEARANCE_RESULTS.includes(result)))) throw new Error("Invalid plate appearances");
      const scoringPosition = sourcePlayer.scoringPosition;
      if (!Array.isArray(scoringPosition) || scoringPosition.length !== appearances.length || scoringPosition.some((value) => value !== null && typeof value !== "boolean")) throw new Error("Invalid scoring position");
      const stats = emptyPlayerStats();
      stats.plateAppearances = appearances;
      stats.scoringPosition = scoringPosition;
      for (const field of ["rbis", "runs", "stolenBases", "caughtStealingAttempts", "errors", "caughtStealing"] as const) {
        const statValue = sourcePlayer[field];
        if (typeof statValue !== "number" || !Number.isSafeInteger(statValue) || statValue < 0) throw new Error("Invalid stat value");
        stats[field] = statValue;
      }
      game[playerId] = stats;
    }
    games[key] = game;
  }
  return { games: Object.keys(games).length > 0 ? games : normalized.games, scheduleIds: normalized.scheduleIds };
}
