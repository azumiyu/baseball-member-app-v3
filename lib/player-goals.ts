import {
  TEAMS_ONE_BATTERS_COLUMNS,
  TEAMS_ONE_PITCHERS_COLUMNS,
} from "./teamsone-batters";

export const PLAYER_GOAL_LIMIT = 10;
export const PLAYER_GOAL_DEFAULT_COUNT = 3;

export type PlayerGoalKind = "batting" | "pitching" | "manual";
export type PlayerGoalDirection = "gte" | "lte";

export type PlayerGoalInput = {
  title: string;
  kind: PlayerGoalKind;
  metric: string | null;
  targetValue: number | null;
  direction: PlayerGoalDirection | null;
  manualProgress: number;
  manualNote: string;
};

export type PlayerGoal = PlayerGoalInput & {
  id: string;
  playerId: string;
  season: number;
  sortOrder: number;
  playerName: string;
  playerNumber: string;
  actualValue: string | null;
  progressPercent: number | null;
  achieved: boolean | null;
};

export type PlayerGoalTrend = {
  date: string;
  achieved: number;
  total: number;
  percent: number;
};

const DERIVED_BATTING_METRICS = ["ISO", "BABIP", "BB/K", "BB%", "K%", "PA/HR"];
const DERIVED_PITCHING_METRICS = ["WHIP", "K/9", "BB/9", "K/BB", "H/9", "HR/9", "HBP/9", "RA/9", "投球数/回"];

export const PLAYER_GOAL_METRICS = {
  batting: [...TEAMS_ONE_BATTERS_COLUMNS, ...DERIVED_BATTING_METRICS],
  pitching: [...TEAMS_ONE_PITCHERS_COLUMNS, ...DERIVED_PITCHING_METRICS],
} as const;

export function parsePlayerGoalInput(value: unknown): PlayerGoalInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 100 || /[\u0000-\u001f\u007f]/.test(title)) return null;
  if (input.kind !== "manual" && input.kind !== "batting" && input.kind !== "pitching") return null;
  if (input.kind === "manual") {
    const manualProgress = input.manualProgress;
    const manualNote = typeof input.manualNote === "string" ? input.manualNote.trim() : "";
    if (!Number.isInteger(manualProgress) || (manualProgress as number) < 0 || (manualProgress as number) > 100
      || (manualProgress as number) % 5 !== 0 || manualNote.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(manualNote)) return null;
    return { title, kind: "manual", metric: null, targetValue: null, direction: null, manualProgress: manualProgress as number, manualNote };
  }
  const kind = input.kind;
  const metric = input.metric;
  const targetValue = input.targetValue;
  const direction = input.direction;
  if (typeof metric !== "string" || !(PLAYER_GOAL_METRICS[kind] as readonly string[]).includes(metric)
    || typeof targetValue !== "number" || !Number.isFinite(targetValue) || targetValue <= 0 || targetValue > 1_000_000
    || direction !== "gte" && direction !== "lte") return null;
  return {
    title, kind, metric, targetValue, direction,
    manualProgress: 0,
    manualNote: "",
  };
}

export function playerGoalProgress(actual: number, target: number, direction: PlayerGoalDirection): number {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return 0;
  if (direction === "gte") return Math.min(100, actual / target * 100);
  if (actual <= target) return 100;
  return target / actual * 100;
}

export function playerGoalAchieved(actual: number, target: number, direction: PlayerGoalDirection): boolean {
  return direction === "gte" ? actual >= target : actual <= target;
}

export function formatPlayerGoalTarget(metric: string, value: number, direction: PlayerGoalDirection): string {
  let display: string;
  if (["打率", "出塁率", "長打率", "得点圏打率", "BB%", "K%"].includes(metric)) {
    display = value.toFixed(3).replace(/^0/, "");
  } else if (["OPS", "防御率", "K/9", "WHIP", "BB/9", "K/BB", "H/9", "HR/9", "HBP/9", "RA/9", "投球数/回", "ISO", "BABIP", "BB/K", "PA/HR"].includes(metric)) {
    display = value.toFixed(2);
  } else {
    display = String(value);
  }
  const suffix = metric === "本塁打" ? "本" : metric === "打点" || metric === "得点" ? "点" : metric === "盗塁" ? "個" : metric === "犠打" || metric === "犠飛" ? "本" : "";
  return `${direction === "gte" ? "以上" : "以下"} ${display}${suffix}`;
}
