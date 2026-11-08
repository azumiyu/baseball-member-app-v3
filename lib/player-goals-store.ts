import type { AuthMember } from "./auth-types";
import { db, random } from "./server";
import { findPersonalBatter, personalMetricValue } from "./teamsone-personal";
import { teamsOneColumns, teamsOneCurrentYear, teamsOneStatNumber, type TeamsOneBattingResponse, type TeamsOneStatsKind } from "./teamsone-batters";
import { readTeamsOneStats } from "./teamsone-stats-api";
import {
  PLAYER_GOAL_LIMIT,
  playerGoalAchieved,
  playerGoalProgress,
  type PlayerGoal,
  type PlayerGoalInput,
  type PlayerGoalTrend,
} from "./player-goals";

type GoalRow = {
  id: string; player_id: string; season: number; title: string; kind: PlayerGoal["kind"];
  metric: string | null; target_value: number | null; direction: PlayerGoal["direction"];
  manual_progress: number; manual_note: string; sort_order: number; player_name: string; player_number: string;
};
type PlayerRow = { id: string; name: string; number: string; sort_order: number };
type SnapshotRow = { japan_date: string; achieved_count: number; total_count: number; progress_percent: number };

export class PlayerGoalError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function seasonValid(season: number) {
  return Number.isInteger(season) && season >= 2022 && season <= teamsOneCurrentYear();
}

function jstDate(now: number) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function jstDateOffset(now: number, days: number) {
  const date = new Date(now + 9 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function jstMonthAgo(now: number) {
  const date = new Date(now + 9 * 60 * 60 * 1000);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.toISOString().slice(0, 10);
}

function trend(row: SnapshotRow | null): PlayerGoalTrend | null {
  return row && row.total_count > 0 ? {
    date: row.japan_date, achieved: row.achieved_count, total: row.total_count,
    percent: row.progress_percent,
  } : null;
}

function hasMetricSample(player: NonNullable<ReturnType<typeof findPersonalBatter>["player"]>, metric: string, kind: TeamsOneStatsKind) {
  const value = (column: string) => teamsOneStatNumber(player.values[teamsOneColumns(kind).indexOf(column)]);
  if (kind === "batting") {
    if (["打率", "長打率", "ISO", "BABIP"].includes(metric)) return value("打数") > 0;
    if (["出塁率", "OPS", "BB%", "K%"].includes(metric)) return value("打席") > 0;
    if (metric === "得点圏打率") return Number.isFinite(value(metric)) && value("打席") > 0;
    return true;
  }
  if (metric === "勝率") return value("勝") + value("敗") > 0;
  if (["防御率", "WHIP", "K/9", "BB/9", "K/BB", "H/9", "HR/9", "HBP/9", "RA/9", "投球数/回"].includes(metric)) {
    return value("投球回") > 0;
  }
  return true;
}

export type PlayerGoalsResponse = {
  year: number;
  players: { id: string; name: string; number: string }[];
  goals: PlayerGoal[];
  teamProgress: { achieved: number; total: number; percent: number };
  comparisons: { week: PlayerGoalTrend | null; month: PlayerGoalTrend | null };
  statsUnavailable: TeamsOneStatsKind[];
  statsStale: TeamsOneStatsKind[];
};

export async function readPlayerGoals(req: Request, year: number): Promise<PlayerGoalsResponse> {
  if (!seasonValid(year)) throw new PlayerGoalError("表示する年度を確認してください。", 400);
  const [playerRows, goalRows] = await Promise.all([
    db().prepare("SELECT id,name,number,sort_order FROM players WHERE sort_order IS NOT NULL ORDER BY sort_order,id")
      .all<PlayerRow>(),
    db().prepare(`SELECT g.id,g.player_id,g.season,g.title,g.kind,g.metric,g.target_value,g.direction,
        g.manual_progress,g.manual_note,g.sort_order,p.name AS player_name,p.number AS player_number
      FROM player_goals g JOIN players p ON p.id=g.player_id AND p.sort_order IS NOT NULL
      WHERE g.season=? ORDER BY p.sort_order,g.sort_order,g.created_at,g.id`)
      .bind(year).all<GoalRow>(),
  ]);
  const battingNeeded = goalRows.results.some((goal) => goal.kind === "batting");
  const pitchingNeeded = goalRows.results.some((goal) => goal.kind === "pitching");
  const origin = new URL(req.url).origin;
  const query = `year=${year}&unreached=true`;
  const [battingResult, pitchingResult] = await Promise.all([
    battingNeeded
      ? readTeamsOneStats(`${origin}/api/teamsone/batters?${query}`, "batting").then((data) => ({ data }), () => ({ data: null }))
      : Promise.resolve({ data: null }),
    pitchingNeeded
      ? readTeamsOneStats(`${origin}/api/teamsone/pitchers?${query}`, "pitching").then((data) => ({ data }), () => ({ data: null }))
      : Promise.resolve({ data: null }),
  ]);
  const sources: Partial<Record<TeamsOneStatsKind, TeamsOneBattingResponse | null>> = {
    batting: battingResult.data,
    pitching: pitchingResult.data,
  };
  const statsUnavailable = ([("batting" as const), ("pitching" as const)] as TeamsOneStatsKind[])
    .filter((kind) => (kind === "batting" ? battingNeeded : pitchingNeeded) && !sources[kind]);
  const statsStale = ([("batting" as const), ("pitching" as const)] as TeamsOneStatsKind[])
    .filter((kind) => !!sources[kind]?.stale);
  const goals: PlayerGoal[] = goalRows.results.map((goal) => {
    const base: PlayerGoal = {
      id: goal.id, playerId: goal.player_id, season: goal.season, title: goal.title,
      kind: goal.kind, metric: goal.metric, targetValue: goal.target_value,
      direction: goal.direction, manualProgress: goal.manual_progress, manualNote: goal.manual_note, sortOrder: goal.sort_order,
      playerName: goal.player_name, playerNumber: goal.player_number,
      actualValue: null, progressPercent: null, achieved: false,
    };
    if (goal.kind === "manual") return {
      ...base, actualValue: `${goal.manual_progress}%`, progressPercent: goal.manual_progress,
      achieved: goal.manual_progress >= 100,
    };
    const source = sources[goal.kind];
    if (!source || !goal.metric || goal.target_value === null || !goal.direction) return base;
    const player = findPersonalBatter(source.rows, { name: goal.player_name, number: goal.player_number }).player;
    if (!player || !hasMetricSample(player, goal.metric, goal.kind)) return base;
    const value = personalMetricValue(player, goal.metric, goal.kind);
    const actual = teamsOneStatNumber(value);
    if (!Number.isFinite(actual)) return base;
    return {
      ...base, actualValue: value,
      progressPercent: playerGoalProgress(actual, goal.target_value, goal.direction),
      achieved: playerGoalAchieved(actual, goal.target_value, goal.direction),
    };
  });
  const achieved = goals.filter((goal) => goal.achieved === true).length;
  const total = goals.length;
  const percent = total > 0 ? goals.reduce((sum, goal) => sum + (goal.progressPercent ?? 0), 0) / total : 0;
  const now = Date.now();
  const today = jstDate(now);
  if (total > 0) {
    await db().prepare(`INSERT INTO player_goal_progress_snapshots(season,japan_date,achieved_count,total_count,progress_percent,recorded_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(season,japan_date) DO UPDATE SET
        achieved_count=excluded.achieved_count,total_count=excluded.total_count,
        progress_percent=excluded.progress_percent,recorded_at=excluded.recorded_at`)
      .bind(year, today, achieved, total, percent, now).run();
  }
  const [weekRow, monthRow] = await Promise.all([
    db().prepare(`SELECT japan_date,achieved_count,total_count,progress_percent FROM player_goal_progress_snapshots
      WHERE season=? AND japan_date<=? ORDER BY japan_date DESC LIMIT 1`).bind(year, jstDateOffset(now, 7)).first<SnapshotRow>(),
    db().prepare(`SELECT japan_date,achieved_count,total_count,progress_percent FROM player_goal_progress_snapshots
      WHERE season=? AND japan_date<=? ORDER BY japan_date DESC LIMIT 1`).bind(year, jstMonthAgo(now)).first<SnapshotRow>(),
  ]);
  return {
    year,
    players: playerRows.results.map(({ id, name, number }) => ({ id, name, number })),
    goals,
    teamProgress: { achieved, total, percent },
    comparisons: { week: trend(weekRow ?? null), month: trend(monthRow ?? null) },
    statsUnavailable,
    statsStale,
  };
}

function canEdit(member: AuthMember, playerId: string) {
  return member.isAdmin || member.id === playerId;
}

export async function createPlayerGoal(member: AuthMember, playerId: string, year: number, input: PlayerGoalInput) {
  if (!canEdit(member, playerId)) throw new PlayerGoalError("自分の目標だけ編集できます。", 403);
  if (!seasonValid(year)) throw new PlayerGoalError("表示する年度を確認してください。", 400);
  const player = await db().prepare("SELECT id FROM players WHERE id=? AND sort_order IS NOT NULL")
    .bind(playerId).first<{ id: string }>();
  if (!player) throw new PlayerGoalError("選手が見つかりません。", 404);
  const count = await db().prepare("SELECT COUNT(*) AS count FROM player_goals WHERE player_id=? AND season=?")
    .bind(playerId, year).first<{ count: number }>();
  if ((count?.count ?? 0) >= PLAYER_GOAL_LIMIT) throw new PlayerGoalError("目標は1人につき10件まで登録できます。", 409);
  const now = Date.now();
  const id = random();
  const inserted = await db().prepare(`INSERT INTO player_goals(id,player_id,season,title,kind,metric,target_value,direction,manual_progress,manual_note,sort_order,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT MAX(sort_order)+1 FROM player_goals WHERE player_id=? AND season=?),0),?,?
    WHERE (SELECT COUNT(*) FROM player_goals WHERE player_id=? AND season=?) < ?`)
    .bind(id, playerId, year, input.title, input.kind, input.metric, input.targetValue, input.direction, input.manualProgress,
      input.manualNote, playerId, year, now, now, playerId, year, PLAYER_GOAL_LIMIT).run();
  if (inserted.meta.changes !== 1) throw new PlayerGoalError("目標は1人につき10件まで登録できます。", 409);
  return id;
}

async function editableGoal(member: AuthMember, id: string) {
  const goal = await db().prepare("SELECT id,player_id,season,sort_order FROM player_goals WHERE id=?")
    .bind(id).first<{ id: string; player_id: string; season: number; sort_order: number }>();
  if (!goal) throw new PlayerGoalError("目標が見つかりません。", 404);
  if (!canEdit(member, goal.player_id)) throw new PlayerGoalError("自分の目標だけ編集できます。", 403);
  return goal;
}

export async function updatePlayerGoal(member: AuthMember, id: string, input: PlayerGoalInput) {
  const goal = await editableGoal(member, id);
  await db().prepare(`UPDATE player_goals SET title=?,kind=?,metric=?,target_value=?,direction=?,manual_progress=?,manual_note=?,updated_at=?
    WHERE id=?`).bind(input.title, input.kind, input.metric, input.targetValue, input.direction,
      input.manualProgress, input.manualNote, Date.now(), goal.id).run();
}

export async function deletePlayerGoal(member: AuthMember, id: string) {
  await editableGoal(member, id);
  await db().prepare("DELETE FROM player_goals WHERE id=?").bind(id).run();
}
