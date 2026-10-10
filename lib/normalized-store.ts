import { type TeamData } from "./model";
import { type EquipmentData } from "./equipment";
import type { AccountingData } from "./accounting";
import { emptyPlayerStats, gameKey, parseGameKey, MAX_REGISTERED_STATS_GAMES, type StatsData, type PlateAppearanceResult, type StatsSchedulePage, type StatsLineupData, type StatsLineups } from "./stats";
import { db, digest, random, token } from "./server";
import type { AuthMember } from "./auth-types";
import { japanDate, upcomingSaturday, type ScheduleData, type ScheduleGame } from "./schedule";
import { projectScheduleOrder, type SavedLineup } from "./schedule-order";

export type DataScope = "team" | "equipment" | "stats" | "schedule" | "accounting";
export type ScopeData = { team: TeamData; equipment: EquipmentData; stats: StatsData; schedule: ScheduleData; accounting: AccountingData };
type Cell = string | number | null;
type Row = Cell[];
type Tables = Record<string, Row[]>;
type Table = {
  name: string;
  columns: string[];
  keys: string[];
  order: string;
  filter?: string;
  retire?: boolean;
};

// SQL identifiers come only from this allowlist, never from request data.
// Parent tables precede children; removals run in the reverse order.
// Role columns stay outside this allowlist so roster edits cannot grant access.
const tables: Record<DataScope, Table[]> = {
  accounting: [
    { name: "accounting_entries", columns: ["id", "date", "category", "income", "expense", "created_by", "created_at"], keys: ["id"], order: "date DESC, created_at DESC, id" },
    { name: "membership_payments", columns: ["year", "player_id", "paid", "paid_at"], keys: ["year", "player_id"], order: "year DESC, player_id" },
  ],
  team: [
    { name: "players", columns: ["id", "name", "number", "kana", "sort_order", "bench_order", "absent_order"], keys: ["id"], order: "sort_order", filter: "sort_order IS NOT NULL", retire: true },
    { name: "team_settings", columns: ["id", "team_name", "manager", "tournament", "game_date", "opponent", "mode", "pitcher_id", "schedule_id", "start_time", "location", "map_url"], keys: ["id"], order: "id" },
    { name: "name_options", columns: ["kind", "name", "sort_order"], keys: ["kind", "name"], order: "kind, sort_order" },
    { name: "lineup_slots", columns: ["batting_order", "position", "player_id"], keys: ["batting_order"], order: "batting_order" },
  ],
  equipment: [
    { name: "equipment_items", columns: ["id", "name", "holder_id", "note", "sort_order", "notify_line"], keys: ["id"], order: "sort_order" },
  ],
  schedule: [
    { name: "schedule_games", columns: ["id", "date", "start_time", "title", "opponent", "location", "map_url", "status", "details_revision", "previous_start_time", "previous_location", "changed_by", "end_time", "previous_end_time", "umpire_arranged"], keys: ["id"], order: "date, start_time, id" },
    { name: "schedule_responses", columns: ["schedule_id", "player_id", "status", "comment", "confirmed_revision"], keys: ["schedule_id", "player_id"], order: "schedule_id, player_id" },
  ],
  stats: [
    { name: "stats_games", columns: ["game_date", "game_number", "schedule_id"], keys: ["game_date", "game_number"], order: "game_date, game_number" },
    { name: "player_game_stats", columns: ["game_date", "game_number", "player_id", "rbis", "runs", "stolen_bases", "caught_stealing_attempts", "errors", "caught_stealing"], keys: ["game_date", "game_number", "player_id"], order: "game_date, game_number, player_id" },
    { name: "plate_appearances", columns: ["game_date", "game_number", "player_id", "appearance_order", "result", "scoring_position"], keys: ["game_date", "game_number", "player_id", "appearance_order"], order: "game_date, game_number, player_id, appearance_order" },
  ],
};

const lineupTables: Table[] = [
  { name: "schedule_lineups", columns: ["schedule_id", "mode", "pitcher_id"], keys: ["schedule_id"], order: "schedule_id" },
  { name: "schedule_lineup_slots", columns: ["schedule_id", "batting_order", "position", "player_id"], keys: ["schedule_id", "batting_order"], order: "schedule_id,batting_order" },
];

function lineupSnapshotSql() {
  return `json_object(${lineupTables.map((table) => `'${table.name}',(SELECT json_group_array(json_array(${table.columns.join(",")})) FROM (SELECT ${table.columns.join(",")} FROM ${table.name} WHERE schedule_id IN (SELECT id FROM schedule_selection) ORDER BY ${table.order}))`).join(",")},
    'retained_lineup_schedule_ids',(SELECT json_group_array(json_array(id)) FROM retained_lineup_schedules))`;
}

/** Keep recent games available before stats are entered, as well as the games
 * still shown in the registered-stats confirmation and the working order.
 */
function retainedLineupScheduleSql() {
  return `SELECT id FROM (SELECT id FROM schedule_games WHERE date<?
      ORDER BY date DESC,start_time DESC,id DESC LIMIT ${MAX_REGISTERED_STATS_GAMES})
    UNION SELECT schedule_id AS id FROM (
      SELECT g.schedule_id FROM stats_games g LEFT JOIN schedule_games s ON s.id=g.schedule_id
      ORDER BY COALESCE(s.date,g.game_date) DESC,
        COALESCE(s.start_time,'') DESC, g.game_number DESC, g.game_date DESC
      LIMIT ${MAX_REGISTERED_STATS_GAMES}) WHERE schedule_id IS NOT NULL
    UNION SELECT schedule_id AS id FROM team_settings WHERE id=1 AND schedule_id IS NOT NULL`;
}

export const SCHEDULE_PAGE_SIZE = 20;
export type ScheduleQuery =
  | { kind: "upcoming" }
  | { kind: "past"; before?: { date: string; id: string } }
  | { kind: "single"; id: string }
  | { kind: "write"; ids: string[] };
type SnapshotSelection = {
  schedule?: ScheduleQuery;
  team?: Pick<TeamData, "date" | "scheduleId">;
  statsBefore?: { date: string; id: string };
  statsPageOnly?: boolean;
};

/** All schedule snapshots share a bounded/indexed ID selection. Keep this a
 * single SELECT: D1 limits compound SELECTs to five terms, and saves include
 * both the current game and the requested game, including archived dates.
 */
function scheduleSelectionSql(scope: "team" | "schedule", selection: SnapshotSelection = {}, now = new Date()) {
  const values: Cell[] = [];
  const query = selection.schedule ?? { kind: "upcoming" };
  const conditions: string[] = [];
  if (scope === "team" || query.kind === "upcoming") {
    conditions.push("date>=?");
    values.push(japanDate(now));
  } else if (query.kind === "past") {
    conditions.push(`id IN (SELECT id FROM schedule_games WHERE date<?
      ${query.before ? "AND (date,id)<(?,?)" : ""}
      ORDER BY date DESC,id DESC LIMIT ${SCHEDULE_PAGE_SIZE + 1})`);
    values.push(japanDate(now), ...(query.before ? [query.before.date, query.before.id] : []));
  } else if (query.kind === "single") {
    conditions.push("id=?");
    values.push(query.id);
  } else {
    conditions.push("id IN (SELECT value FROM json_each(?))");
    values.push(JSON.stringify(query.ids));
  }
  if (scope === "team" || query.kind === "write") {
    conditions.push("id IN (SELECT id FROM retained_lineup_schedules)");
    conditions.push("id=(SELECT schedule_id FROM team_settings WHERE id=1)");
    conditions.push("date=(SELECT game_date FROM team_settings WHERE id=1)");
    if (query.kind === "write") {
      conditions.push("date=?");
      values.push(upcomingSaturday(now));
    }
    if (selection.team) {
      conditions.push("id=?");
      conditions.push("date=?");
      values.push(selection.team.scheduleId, selection.team.date);
    }
  }
  return { sql: `WITH retained_lineup_schedules AS (${retainedLineupScheduleSql()}),
    schedule_selection AS (SELECT id FROM schedule_games WHERE ${conditions.join(" OR ")})`, values: [japanDate(now), ...values] };
}

function snapshotSql(scope: DataScope, partitioned: boolean, past = false, statsOptions = false, statsPageOnly = false, statsLineups = false) {
  const entries = tables[scope].map((table) =>
    `'${table.name}', (SELECT json_group_array(json_array(${table.columns.join(",")}))
      FROM (SELECT ${table.columns.join(",")} FROM ${table.name}
        ${scope === "schedule" ? `WHERE ${table.name === "schedule_games" ? "id" : "schedule_id"} IN (SELECT id FROM schedule_selection)`
          : partitioned ? "WHERE (game_date,game_number) IN (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?))" : table.filter ? `WHERE ${table.filter}` : ""}
        ORDER BY ${past && table.name === "schedule_games" ? "date DESC,id DESC" : table.order}))`,
  );
  if (scope === "accounting") entries.push("'accounting_players', (SELECT json_group_array(json_array(id,name)) FROM (SELECT id,name FROM players WHERE sort_order IS NOT NULL ORDER BY sort_order,id))");
  if (statsOptions) entries.push(
    `'stats_schedule_options', (SELECT json_group_array(json_array(id,date,start_time,title,opponent,location))
      FROM (SELECT id,date,start_time,title,opponent,location FROM schedule_games
        WHERE id IN (SELECT id FROM stats_schedule_page ORDER BY date DESC,id DESC LIMIT ${SCHEDULE_PAGE_SIZE})
        ${statsPageOnly ? "" : "OR date >= (SELECT today FROM stats_schedule_bounds) OR id IN (SELECT schedule_id FROM stats_games WHERE schedule_id IS NOT NULL)"}
        ORDER BY date DESC,start_time,id))`,
    "'stats_schedule_page', (SELECT json_group_array(json_array(date,id)) FROM (SELECT date,id FROM stats_schedule_page ORDER BY date DESC,id DESC))",
  );
  if (statsLineups) entries.push(
    `'stats_lineup_slots', (SELECT json_group_array(json_array(schedule_id,batting_order,player_id))
      FROM (SELECT schedule_id,batting_order,player_id FROM schedule_lineup_slots
        WHERE schedule_id IN (SELECT schedule_id FROM stats_games WHERE schedule_id IS NOT NULL)
          AND schedule_id IS NOT (SELECT schedule_id FROM team_settings WHERE id=1)
        UNION ALL
        SELECT settings.schedule_id,slots.batting_order,slots.player_id
          FROM team_settings settings CROSS JOIN lineup_slots slots
          WHERE settings.id=1 AND settings.schedule_id IN (SELECT schedule_id FROM stats_games WHERE schedule_id IS NOT NULL)
        ORDER BY schedule_id,batting_order))`,
  );
  return `json_object(${entries.join(",")})`;
}

export function statsScheduleMetadata(snapshot: Snapshot): StatsSchedulePage {
  const rows = snapshot.tables?.stats_schedule_options ?? [];
  const page = snapshot.tables?.stats_schedule_page ?? [];
  const hasMoreSchedules = page.length > SCHEDULE_PAGE_SIZE;
  const last = page[SCHEDULE_PAGE_SIZE - 1];
  return {
    schedules: rows.map((row) => ({ id: row[0] as string, date: row[1] as string, startTime: row[2] as string, title: row[3] as string, opponent: row[4] as string, location: row[5] as string })),
    hasMoreSchedules,
    nextScheduleCursor: hasMoreSchedules && last ? { date: last[0] as string, id: last[1] as string } : null,
  };
}

export function statsLineupMetadata(snapshot: Snapshot): StatsLineupData {
  const lineups: StatsLineups = Object.create(null);
  for (const row of snapshot.tables?.stats_lineup_slots ?? []) {
    const scheduleId = row[0] as string;
    const battingOrder = row[1] as number;
    const slots = lineups[scheduleId] ?? [];
    while (slots.length <= battingOrder) slots.push(null);
    slots[battingOrder] = row[2] as string | null;
    lineups[scheduleId] = slots;
  }
  return { lineups };
}

export type Snapshot = {
  revision: number;
  tables: Tables | null;
  sessionHash: string;
  member: AuthMember;
  related?: { revision: number; tables: Tables | null };
  week?: string;
  lineups?: Tables;
};

export class TeamSettingsPermissionError extends Error {
  constructor() { super("チーム名・監督名を変更できるのは管理者だけです。"); }
}

export class SchedulePermissionError extends Error {
  constructor() {
    super("試合情報の編集はオーダー編集者、他の選手の出欠・コメントの変更は管理者だけが行えます。");
  }
}

export class StatsPermissionError extends Error {
  constructor() {
    super("自分以外の選手の成績を変更できるのは管理者だけです。");
  }
}

export class StatsScheduleError extends Error {}
export class AccountingPermissionError extends Error {
  constructor() { super("会計を編集できるのは管理者だけです。"); }
}

export class LineupPermissionError extends Error {
  constructor() {
    super("オーダーを変更できるのは安曇・戸田・押野・池原・根岸の5名だけです。");
  }
}

/** One SELECT includes authentication, revision and all requested tables.
 * CASE avoids scanning child tables for unchanged polls / stale writes.
 */
export async function readSnapshot(
  req: Request,
  scope: DataScope,
  condition?: { revision: number; mode: "changed" | "matching"; scheduleRevision?: number },
  gameKeys?: string[],
  selection: SnapshotSelection = {},
): Promise<Snapshot | null> {
  const session = token(req);
  if (!/^[a-f0-9]{64}$/.test(session)) return null;
  const linked = scope === "team" || (scope === "schedule" && condition?.mode === "matching");
  const otherScope = scope === "team" ? "schedule" : "team";
  let predicate = condition
    ? `r.revision ${condition.mode === "changed" ? "<>" : "="} ?`
    : "1";
  const predicateValues: (string | number)[] = condition ? [condition.revision] : [];
  if (scope === "team" && condition?.mode === "changed") {
    predicate = `(${predicate} OR related.revision<>? OR settings.schedule_week<>?)`;
    predicateValues.push(condition.scheduleRevision ?? -1, upcomingSaturday());
  }
  const partition = scope === "stats" && gameKeys !== undefined
    ? JSON.stringify(gameKeys.map((key) => {
      const game = parseGameKey(key);
      if (!game) throw new Error("Invalid game key");
      return [game.date, game.number];
    })) : null;
  const sessionHash = await digest(session);
  const scheduleSelection = scope === "team" || scope === "schedule" ? scheduleSelectionSql(scope, selection) : null;
  const statsOptions = scope === "stats" && ((gameKeys === undefined && condition?.mode !== "matching") || selection.statsPageOnly === true);
  const statsSelection = statsOptions ? {
    sql: `WITH stats_schedule_bounds AS (SELECT ? AS today), stats_schedule_page AS (
      SELECT date,id FROM schedule_games WHERE date < (SELECT today FROM stats_schedule_bounds)
      ${selection.statsBefore ? "AND (date,id)<(?,?)" : ""}
      ORDER BY date DESC,id DESC LIMIT ${SCHEDULE_PAGE_SIZE + 1})`,
    values: [japanDate(), ...(selection.statsBefore ? [selection.statsBefore.date, selection.statsBefore.id] : [])],
  } : null;
  const result = await db().prepare(`
    ${scheduleSelection?.sql ?? statsSelection?.sql ?? ""}
    SELECT r.revision, p.id, p.name, p.number, p.is_admin, p.can_edit_lineup,
      ${linked ? "related.revision AS related_revision, settings.schedule_week," : ""}
      CASE WHEN ${predicate} THEN ${linked
        ? `json_object('primary', ${snapshotSql(scope, false)}, 'related', ${snapshotSql(otherScope, false)}, 'lineups', ${lineupSnapshotSql()})`
        : snapshotSql(scope, partition !== null, selection.schedule?.kind === "past", statsOptions, selection.statsPageOnly,
          scope === "stats" && gameKeys === undefined && selection.statsPageOnly !== true)} END AS data
    FROM sessions AS s
    JOIN member_devices AS d ON d.hash=s.device_hash
    JOIN players AS p ON p.id=d.player_id AND p.sort_order IS NOT NULL
    JOIN app_revisions AS r ON r.scope=?
    ${linked ? `JOIN app_revisions AS related ON related.scope='${otherScope}' JOIN team_settings AS settings ON settings.id=1` : ""}
    WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
  `).bind(
    ...(scheduleSelection?.values ?? statsSelection?.values ?? []),
    ...predicateValues,
    ...(partition === null ? [] : tables[scope].map(() => partition)),
    scope, sessionHash, Date.now(),
  ).first<{ revision: number; data: string | null; id: string; name: string; number: string; is_admin: number; can_edit_lineup: number; related_revision?: number; schedule_week?: string }>();
  if (!result) return null;
  const decoded = result.data === null ? null : JSON.parse(result.data);
  return {
    revision: result.revision,
    tables: decoded === null ? null : linked ? decoded.primary as Tables : decoded as Tables,
    ...(linked ? { related: { revision: result.related_revision!, tables: decoded?.related ?? null }, week: result.schedule_week ?? "", lineups: decoded?.lineups } : {}),
    sessionHash,
    member: { id: result.id, name: result.name, number: result.number, isAdmin: result.is_admin === 1, canEditLineup: result.can_edit_lineup === 1 },
  };
}

export function decodeData(scope: DataScope, rows: Tables): ScopeData[DataScope] {
  if (scope === "accounting") return {
    entries: rows.accounting_entries.map((row) => ({ id: row[0] as string, date: row[1] as string, category: row[2] as string, income: row[3] as number, expense: row[4] as number, createdBy: row[5] as string, createdAt: row[6] as number })),
    payments: rows.membership_payments.map((row) => ({ year: row[0] as number, playerId: row[1] as string, paid: row[2] === 1, paidAt: row[3] as number | null })),
    players: (rows.accounting_players ?? []).map((row) => ({ id: row[0] as string, name: row[1] as string })),
  } satisfies AccountingData;
  if (scope === "team") {
    const settings = rows.team_settings[0];
    if (!settings) throw new Error("Team migration is incomplete");
    const players = rows.players;
    return {
      teamName: settings[1] as string,
      manager: settings[2] as string,
      tournament: settings[3] as string,
      date: settings[4] as string,
      opponent: settings[5] as string,
      mode: settings[6] as TeamData["mode"],
      pitcher: settings[7] as string | null,
      scheduleId: settings[8] as string | null,
      startTime: settings[9] as string,
      location: settings[10] as string,
      mapUrl: settings[11] as string,
      count: rows.lineup_slots.length,
      tournaments: rows.name_options.filter((row) => row[0] === "tournament").map((row) => row[1] as string),
      opponents: rows.name_options.filter((row) => row[0] === "opponent").map((row) => row[1] as string),
      locations: rows.name_options.filter((row) => row[0] === "location").map((row) => row[1] as string),
      players: players.map((row) => ({ id: row[0] as string, name: row[1] as string, number: row[2] as string, kana: row[3] as string })),
      slots: rows.lineup_slots.map((row) => ({ position: row[1] as TeamData["slots"][number]["position"], playerId: row[2] as string | null })),
      benchOrder: players.filter((row) => row[5] !== null).sort((a, b) => Number(a[5]) - Number(b[5])).map((row) => row[0] as string),
      absentIds: players.filter((row) => row[6] !== null).sort((a, b) => Number(a[6]) - Number(b[6])).map((row) => row[0] as string),
    } satisfies TeamData;
  }
  if (scope === "equipment") {
    return {
      items: rows.equipment_items.map((row) => ({ id: row[0] as string, name: row[1] as string, holderId: row[2] as string | null, note: row[3] as string, notifyLine: row[5] === 1 })),
    } satisfies EquipmentData;
  }
  if (scope === "schedule") {
    const responsesByGame = new Map<Cell, Array<[string, ScheduleGame["responses"][string]]>>();
    for (const response of rows.schedule_responses) {
      const responses = responsesByGame.get(response[0]) ?? [];
      responses.push([response[1] as string, {
        status: response[2] as ScheduleGame["responses"][string]["status"],
        comment: response[3] as string,
        confirmedRevision: response[4] as number,
      }]);
      responsesByGame.set(response[0], responses);
    }
    return {
      games: rows.schedule_games.map((row) => ({
        id: row[0] as string, date: row[1] as string, startTime: row[2] as string,
        title: row[3] as string, opponent: row[4] as string, location: row[5] as string, mapUrl: row[6] as string,
        status: row[7] as ScheduleGame["status"], detailsRevision: row[8] as number,
        previousStartTime: row[9] as string | null, previousLocation: row[10] as string | null, changedBy: row[11] as string | null,
        endTime: row[12] as string, previousEndTime: row[13] as string | null,
        umpireArranged: row[14] === 1,
        responses: Object.fromEntries(responsesByGame.get(row[0]) ?? []),
      })),
    } satisfies ScheduleData;
  }
  const data: StatsData = { games: {}, scheduleIds: {} };
  for (const row of rows.stats_games) {
    const key = gameKey(row[0] as string, row[1] as number);
    data.games[key] = {};
    if (row[2]) data.scheduleIds[key] = row[2] as string;
  }
  for (const row of rows.player_game_stats) {
    const stats = emptyPlayerStats();
    [stats.rbis, stats.runs, stats.stolenBases, stats.caughtStealingAttempts, stats.errors, stats.caughtStealing] = row.slice(3) as number[];
    data.games[gameKey(row[0] as string, row[1] as number)][row[2] as string] = stats;
  }
  for (const row of rows.plate_appearances) {
    const stats = data.games[gameKey(row[0] as string, row[1] as number)][row[2] as string];
    stats.plateAppearances[row[3] as number] = row[4] as PlateAppearanceResult | null;
    stats.scoringPosition[row[3] as number] = row[5] === 1;
  }
  return data;
}

function encodeTeam(data: TeamData): Tables {
  const order = (ids: string[], id: string) => {
    const index = ids.indexOf(id);
    return index < 0 ? null : index;
  };
  return {
    players: data.players.map((player, index) => [player.id, player.name, player.number, player.kana, index, order(data.benchOrder, player.id), order(data.absentIds, player.id)]),
    team_settings: [[1, data.teamName, data.manager, data.tournament, data.date, data.opponent, data.mode, data.pitcher, data.scheduleId, data.startTime, data.location, data.mapUrl]],
    name_options: [
      ...Array.from(new Set(data.tournaments), (name, index) => ["tournament", name, index]),
      ...Array.from(new Set(data.opponents), (name, index) => ["opponent", name, index]),
      ...Array.from(new Set(data.locations), (name, index) => ["location", name, index]),
    ] as Row[],
    lineup_slots: data.slots.map((slot, index) => [index, slot.position, slot.playerId]),
  };
}

function encodeStats(data: StatsData): Tables {
  const rows: Tables = { stats_games: [], player_game_stats: [], plate_appearances: [] };
  for (const [key, game] of Object.entries(data.games)) {
    const parsed = parseGameKey(key);
    if (!parsed) throw new Error("Invalid game key");
    const { date, number } = parsed;
    rows.stats_games.push([date, number, data.scheduleIds[key] ?? null]);
    for (const [playerId, stats] of Object.entries(game)) {
      rows.player_game_stats.push([date, number, playerId, stats.rbis, stats.runs, stats.stolenBases, stats.caughtStealingAttempts, stats.errors, stats.caughtStealing]);
      stats.plateAppearances.forEach((result, index) => {
        rows.plate_appearances.push([date, number, playerId, index, result, stats.scoringPosition[index] ? 1 : 0]);
      });
    }
  }
  return rows;
}

export function encodeData(scope: DataScope, data: ScopeData[DataScope]): Tables {
  if (scope === "accounting") {
    const accounting = data as AccountingData;
    return {
      accounting_entries: accounting.entries.map((entry) => [entry.id, entry.date, entry.category, entry.income, entry.expense, entry.createdBy, entry.createdAt]),
      membership_payments: accounting.payments.map((payment) => [payment.year, payment.playerId, payment.paid ? 1 : 0, payment.paidAt]),
    };
  }
  if (scope === "team") return encodeTeam(data as TeamData);
  if (scope === "stats") return encodeStats(data as StatsData);
  if (scope === "schedule") {
    const games = (data as ScheduleData).games;
    return {
      schedule_games: games.map((game) => [game.id, game.date, game.startTime, game.title, game.opponent, game.location, game.mapUrl, game.status, game.detailsRevision, game.previousStartTime, game.previousLocation, game.changedBy, game.endTime, game.previousEndTime, game.umpireArranged ? 1 : 0]),
      schedule_responses: games.flatMap((game) => Object.entries(game.responses).map(([id, response]) => [game.id, id, response.status, response.comment, response.confirmedRevision])),
    };
  }
  return { equipment_items: (data as EquipmentData).items.map((item, index) => [item.id, item.name, item.holderId, item.note, index, item.notifyLine ? 1 : 0]) };
}

function changesBetween(scope: DataScope, previous: Tables, next: Tables, selectedTables = tables[scope]) {
  return selectedTables.map((table) => {
    const key = (row: Row) => JSON.stringify(table.keys.map((column) => row[table.columns.indexOf(column)]));
    const oldRows = new Map(previous[table.name].map((row) => [key(row), row]));
    const newRows = new Map(next[table.name].map((row) => [key(row), row]));
    return {
      table,
      upsert: [...newRows].filter(([id, row]) => JSON.stringify(oldRows.get(id)) !== JSON.stringify(row)).map(([, row]) => row),
      remove: [...oldRows].filter(([id]) => !newRows.has(id)).map(([, row]) => table.keys.map((column) => row[table.columns.indexOf(column)])),
    };
  });
}

type ChangeGroup = { scope: DataScope; revision: number; changes: ReturnType<typeof changesBetween> };
const hasChanges = (group: ChangeGroup) => group.changes.some((change) => change.upsert.length || change.remove.length);

function decodeLineups(rows?: Tables): Map<string, SavedLineup> {
  const result = new Map<string, SavedLineup>();
  for (const row of rows?.schedule_lineups ?? []) {
    result.set(row[0] as string, { mode: row[1] as TeamData["mode"], pitcher: row[2] as string | null, slots: [], count: 0 });
  }
  for (const row of rows?.schedule_lineup_slots ?? []) {
    const lineup = result.get(row[0] as string);
    if (lineup) lineup.slots.push({ position: row[2] as TeamData["slots"][number]["position"], playerId: row[3] as string | null });
  }
  for (const lineup of result.values()) lineup.count = lineup.slots.length;
  return result;
}

/** Save only starters. The current order remains the working copy; the selected
 * game's snapshot is restored when switching, retaining recent confirmations.
 */
function lineupChanges(rows: Tables | undefined, before: TeamData, after: TeamData, schedule: ScheduleData, now: Date) {
  const previous = rows ?? { schedule_lineups: [], schedule_lineup_slots: [] };
  const stored = decodeLineups(previous);
  const retained = new Set((previous.retained_lineup_schedule_ids ?? []).map((row) => row[0] as string));
  const games = new Map(schedule.games.map((game) => [game.id, game]));
  const today = japanDate(now);
  for (const id of stored.keys()) {
    if (!games.has(id) || (games.get(id)!.date < today && !retained.has(id))) stored.delete(id);
  }
  for (const team of before.scheduleId !== after.scheduleId ? [before, after] : [after]) {
    if (team.scheduleId && games.has(team.scheduleId) &&
        (games.get(team.scheduleId)!.date >= today || retained.has(team.scheduleId) || team.scheduleId === after.scheduleId)) {
      stored.set(team.scheduleId, { mode: team.mode, pitcher: team.pitcher, slots: team.slots, count: team.slots.length });
    }
  }
  const next: Tables = { schedule_lineups: [], schedule_lineup_slots: [], retained_lineup_schedule_ids: previous.retained_lineup_schedule_ids ?? [] };
  for (const [id, lineup] of stored) {
    next.schedule_lineups.push([id, lineup.mode, lineup.pitcher]);
    lineup.slots.forEach((slot, index) => next.schedule_lineup_slots.push([id, index, slot.position, slot.playerId]));
  }
  const changes = changesBetween("team", previous, next, lineupTables);
  // Parent deletion cascades to its batting-order rows.
  const removed = new Set(changes[0].remove.map((row) => row[0]));
  changes[1].remove = changes[1].remove.filter((row) => !removed.has(row[0]));
  return { changes, next };
}

function rememberScheduleNames(team: TeamData, schedule: ScheduleData, changedIds?: string[]): TeamData {
  const changed = new Set(changedIds);
  const games = schedule.games.filter((game) => changed.has(game.id));
  const add = (values: string[], field: "title" | "opponent" | "location") =>
    [...new Set([...values, ...games.map((game) => game[field]).filter(Boolean)])].slice(-200);
  return { ...team, tournaments: add(team.tournaments, "title"), opponents: add(team.opponents, "opponent"), locations: add(team.locations, "location") };
}

/** Partial requests replace only explicit IDs. Projection context and unloaded
 * history never become implicit deletions when a mobile client saves a page.
 */
export function mergeScheduleChanges(snapshot: Snapshot, incoming: ScheduleData, removedGames: string[]): ScheduleData {
  if (!snapshot.tables) throw new Error("Missing schedule baseline");
  if (removedGames.length && !snapshot.member.canEditLineup) throw new SchedulePermissionError();
  const baseline = decodeData("schedule", snapshot.tables) as ScheduleData;
  const changed = new Map(incoming.games.map((game) => [game.id, game]));
  const removed = new Set(removedGames);
  return {
    games: [
      ...baseline.games.filter((game) => !changed.has(game.id) && !removed.has(game.id)),
      ...incoming.games,
    ],
  };
}

function normalizeScheduleRevisions(previous: Tables, next: Tables, memberId: string): ScheduleData {
  const baseline = decodeData("schedule", previous) as ScheduleData;
  const before = new Map(baseline.games.map((game) => [game.id, game]));
  const incoming = decodeData("schedule", next) as ScheduleData;
  const coreFields = ["startTime", "endTime", "location"] as const;
  return {
    games: incoming.games.map((game) => {
      const old = before.get(game.id);
      const detailsChanged = !!old && coreFields.some((key) => game[key] !== old[key]);
      const detailsRevision = old
        ? old.detailsRevision + (detailsChanged ? 1 : 0)
        : 1;
      if (!Number.isSafeInteger(detailsRevision)) throw new Error("Schedule revision limit reached");
      return {
        ...game,
        detailsRevision,
        previousStartTime: detailsChanged ? old!.startTime : old?.previousStartTime ?? null,
        previousEndTime: detailsChanged ? old!.endTime : old?.previousEndTime ?? null,
        previousLocation: detailsChanged ? old!.location : old?.previousLocation ?? null,
        changedBy: detailsChanged ? memberId : old?.changedBy ?? null,
        responses: Object.fromEntries(Object.entries(game.responses).map(([id, response]) => {
          const prior = old?.responses[id];
          const answered = (detailsChanged && id === memberId) || !prior || response.status !== prior.status || response.comment !== prior.comment ||
            response.confirmedRevision !== prior.confirmedRevision;
          return [id, { ...response, confirmedRevision: answered ? detailsRevision : prior.confirmedRevision }];
        })),
      };
    }),
  };
}

/** Diff against the authenticated baseline; automatic order changes are derived afterwards. */
export async function writeChanges(scope: DataScope, snapshot: Snapshot, next: Tables, scheduleGameIds?: string[]): Promise<{ revision: number; data?: TeamData | ScheduleData | AccountingData } | null> {
  if (scope === "accounting" && snapshot.member.isAdmin !== true) throw new AccountingPermissionError();
  if (!snapshot.tables) return null;
  const previous = snapshot.tables;
  if (scope === "accounting") {
    const now = Date.now();
    const entries = new Map(previous.accounting_entries.map((row) => [row[0], row]));
    const payments = new Map(previous.membership_payments.map((row) => [`${row[0]}:${row[1]}`, row]));
    next = {
      accounting_entries: next.accounting_entries.map((row) => [...row.slice(0, 5), entries.get(row[0])?.[5] ?? snapshot.member.id, entries.get(row[0])?.[6] ?? now]),
      membership_payments: next.membership_payments.map((row) => {
        const old = payments.get(`${row[0]}:${row[1]}`);
        return [...row.slice(0, 3), row[2] === 1 ? old?.[2] === 1 ? old[3] : now : null];
      }),
    };
  }
  const normalizedSchedule = scope === "schedule" ? normalizeScheduleRevisions(previous, next, snapshot.member.id) : undefined;
  if (normalizedSchedule) next = encodeData("schedule", normalizedSchedule);
  const changes = changesBetween(scope, previous, next);
  if (scope === "team" && !snapshot.member.isAdmin &&
      [1, 2].some((index) => previous.team_settings[0][index] !== next.team_settings[0][index])) throw new TeamSettingsPermissionError();
  if (scope === "team" && !snapshot.member.canEditLineup) {
    // Only the authenticated member's profile may change. Registration,
    // other members' profiles, and placement require lineup permission.
    if (changes.slice(1).some((change) => {
      if (snapshot.member.isAdmin && change.table.name === "team_settings") {
        return change.remove.length > 0 || change.upsert.some((row) => row.some((cell, index) => index !== 1 && index !== 2 && cell !== previous.team_settings[0][index]));
      }
      return change.upsert.length || change.remove.length;
    }) ||
        changes[0].remove.length) throw new LineupPermissionError();
    const existing = new Map(previous.players.map((row) => [row[0], row]));
    if (previous.players.length !== next.players.length ||
        previous.players.some((row, index) => next.players[index]?.[0] !== row[0]) ||
        next.players.some((row) => {
          const old = existing.get(row[0]);
          if (!old) return true;
          return row.some((cell, index) =>
            cell !== old[index] && (row[0] !== snapshot.member.id || index < 1 || index > 3),
          );
        })) throw new LineupPermissionError();
  }
  if (scope === "stats") {
    const existingGames = new Map(previous.stats_games.map((row) => [gameKey(row[0] as string, row[1] as number), row]));
    for (const row of changes[0].upsert) {
      const old = existingGames.get(gameKey(row[0] as string, row[1] as number));
      if (!old && !row[2]) throw new StatsScheduleError("新しい成績はスケジュールの試合を選択して登録してください。");
      if (old && row[2] !== old[2] && !snapshot.member.isAdmin) throw new StatsScheduleError("既存成績の試合との紐づけを変更できるのは管理者だけです。");
      if (old && old[2] && !row[2]) throw new StatsScheduleError("試合との紐づけは解除できません。対象の試合を選択してください。");
    }
    if (!snapshot.member.isAdmin) {
      // Check every changed row before pruning cascading deletes. A removed
      // game must not silently delete another member's records.
      const playerId = snapshot.member.id;
      if (changes.slice(1).some((change) =>
        [...change.upsert, ...change.remove].some((row) => row[2] !== playerId),
      )) throw new StatsPermissionError();
      const ownGames = new Set(
        [...previous.player_game_stats, ...next.player_game_stats]
          .filter((row) => row[2] === playerId)
          .map((row) => JSON.stringify(row.slice(0, 2))),
      );
      if ([...changes[0].upsert, ...changes[0].remove].some((row) => !ownGames.has(JSON.stringify(row.slice(0, 2))))) {
        throw new StatsPermissionError();
      }
    }
    // Parent deletes already cascade through the composite foreign keys.
    // Avoid issuing separate deletes for every descendant table in that case.
    const removedGames = new Set(changes[0].remove.map((key) => JSON.stringify(key)));
    const removedPlayers = new Set(changes[1].remove.map((key) => JSON.stringify(key)));
    changes[2].remove = changes[2].remove.filter((key) =>
      !removedGames.has(JSON.stringify(key.slice(0, 2))) &&
      !removedPlayers.has(JSON.stringify(key.slice(0, 3))),
    );
    changes[1].remove = changes[1].remove.filter((key) => !removedGames.has(JSON.stringify(key.slice(0, 2))));
  }
  if (scope === "schedule") {
    if (!snapshot.member.canEditLineup && (changes[0].upsert.length || changes[0].remove.length)) {
      throw new SchedulePermissionError();
    }
    const removedGames = new Set(changes[0].remove.map((row) => row[0]));
    if (!snapshot.member.isAdmin && (
      changes[1].upsert.some((row) => row[1] !== snapshot.member.id) ||
      changes[1].remove.some((row) => row[1] !== snapshot.member.id && !removedGames.has(row[0]))
    )) throw new SchedulePermissionError();
    // Deleting an event also removes its responses through its foreign key.
    changes[1].remove = changes[1].remove.filter((row) => !removedGames.has(row[0]));
  }

  const groups: ChangeGroup[] = [{ scope, revision: snapshot.revision, changes }];
  let projected: TeamData | undefined;
  let week: string | undefined;
  if (scope === "team" || scope === "schedule") {
    if (!snapshot.related?.tables) throw new Error("Missing linked snapshot");
    const teamRows = scope === "team" ? previous : snapshot.related.tables;
    let team = decodeData("team", scope === "team" ? next : teamRows) as TeamData;
    const schedule = decodeData("schedule", scope === "schedule" ? next : snapshot.related.tables) as ScheduleData;
    if (scope === "schedule") team = rememberScheduleNames(team, schedule, scheduleGameIds);
    if (scope === "team" && team.scheduleId && !schedule.games.some((game) => game.id === team.scheduleId)) {
      throw new Error("Schedule no longer exists");
    }
    const previousTeam = decodeData("team", teamRows) as TeamData;
    const selectedGameChanged = scope === "team" && (team.date !== previousTeam.date || team.scheduleId !== previousTeam.scheduleId);
    const now = new Date();
    const result = projectScheduleOrder(team, schedule, snapshot.week ?? "", now, {
      preferCurrentDate: selectedGameChanged, sourceScheduleId: previousTeam.scheduleId, lineups: decodeLineups(snapshot.lineups),
    });
    projected = result.data;
    if (result.week !== snapshot.week) week = result.week;
    const teamChanges = [...changesBetween("team", teamRows, encodeData("team", result.data)),
      ...lineupChanges(snapshot.lineups, selectedGameChanged ? previousTeam : team, result.data, schedule, now).changes];
    if (scope === "team") groups[0].changes = teamChanges;
    else groups.push({ scope: "team", revision: snapshot.related.revision, changes: teamChanges });
  }
  const savedData = scope === "team" ? projected : normalizedSchedule
    ? { games: normalizedSchedule.games.filter((game) => scheduleGameIds?.includes(game.id) ?? true) }
    : scope === "accounting" ? decodeData("accounting", { ...next, accounting_players: previous.accounting_players }) as AccountingData : undefined;
  if (!groups.some(hasChanges) && week === undefined) return { revision: snapshot.revision, ...(savedData ? { data: savedData } : {}) };

  const revision = await commitChanges(db(), groups, snapshot.related
    ? { scope: scope === "team" ? "schedule" : "team", revision: snapshot.related.revision }
    : undefined, { sessionHash: snapshot.sessionHash, member: snapshot.member }, week);
  return revision === null ? null : { revision, ...(savedData ? { data: savedData } : {}) };
}

/** A single transaction claims both revisions before applying either domain. */
async function commitChanges(
  database: D1Database,
  groups: ChangeGroup[],
  related?: { scope: DataScope; revision: number },
  auth?: { sessionHash: string; member: AuthMember },
  week?: string,
  now = new Date(),
): Promise<number | null> {
  const primary = groups[0];
  const scope = primary.scope;
  const writeToken = random();
  // Every mutation is gated by this unique token. Checking revision+1 alone
  // would allow a failed CAS to overwrite the other writer's successful save.
  const guard = "EXISTS (SELECT 1 FROM app_revisions WHERE scope=? AND write_token=?)";
  const statements = [database.prepare(`
    UPDATE app_revisions SET revision=revision+1, write_token=?
    WHERE scope=? AND revision=?
    ${related ? "AND EXISTS (SELECT 1 FROM app_revisions WHERE scope=? AND revision=?)" : ""}
    ${auth ? `AND EXISTS (
      SELECT 1 FROM sessions AS s
      JOIN member_devices AS d ON d.hash=s.device_hash
      JOIN players AS p ON p.id=d.player_id
      WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
        AND p.id=? AND p.sort_order IS NOT NULL AND (p.is_admin=1)=?
        AND (p.can_edit_lineup=1)=?
    )` : ""} RETURNING revision
  `).bind(writeToken, scope, primary.revision,
    ...(related ? [related.scope, related.revision] : []),
    ...(auth ? [auth.sessionHash, Date.now(), auth.member.id, auth.member.isAdmin ? 1 : 0, auth.member.canEditLineup ? 1 : 0] : []))];

  for (const group of groups.slice(1)) {
    if (!hasChanges(group) && !(week !== undefined && group.scope === "team")) continue;
    statements.push(database.prepare(`UPDATE app_revisions SET revision=revision+1, write_token=? WHERE scope=? AND ${guard}`)
      .bind(writeToken, group.scope, scope, writeToken));
  }
  const changes = groups.flatMap((group) => group.changes);

  for (const { table, upsert } of changes) {
    if (!upsert.length) continue;
    const mutable = table.columns.filter((column) => !table.keys.includes(column));
    statements.push(database.prepare(`
      INSERT INTO ${table.name} (${table.columns.join(",")})
      SELECT ${table.columns.map((_, index) => `json_extract(value,'$[${index}]')`).join(",")}
      FROM json_each(?) WHERE ${guard}
      ON CONFLICT (${table.keys.join(",")}) DO ${mutable.length ? `UPDATE SET
        ${mutable.map((column) => `${column}=excluded.${column}`).join(",")}
        WHERE ${mutable.map((column) => `${table.name}.${column} IS NOT excluded.${column}`).join(" OR ")}` : "NOTHING"}
    `).bind(JSON.stringify(upsert), scope, writeToken));
  }

  for (const { table, remove } of [...changes].reverse()) {
    if (!remove.length) continue;
    // JSON binds keep the statement count independent of the number of rows
    // and avoid D1's per-statement bound-parameter limit.
    const keys = `(${table.keys.join(",")}) IN (
      SELECT ${table.keys.map((_, index) => `json_extract(value,'$[${index}]')`).join(",")} FROM json_each(?)
    )`;
    statements.push(database.prepare(`
      ${table.retire
        ? `UPDATE ${table.name} SET sort_order=NULL, bench_order=NULL, absent_order=NULL`
        : `DELETE FROM ${table.name}`}
      WHERE ${keys} AND ${guard}
    `).bind(JSON.stringify(remove), scope, writeToken));
  }
  if (scope === "stats") {
    // Enforce retention after authorized edits. This is a server policy, not
    // permission for clients to delete another member's statistics.
    // Parent deletes cascade to every player's stats and plate appearances.
    statements.push(database.prepare(`
      DELETE FROM stats_games
      WHERE (game_date, game_number) IN (
        SELECT g.game_date, g.game_number
        FROM stats_games g LEFT JOIN schedule_games s ON s.id=g.schedule_id
        ORDER BY COALESCE(s.date,g.game_date) DESC,
          COALESCE(s.start_time,'') DESC, g.game_number DESC, g.game_date DESC
        LIMIT -1 OFFSET ${MAX_REGISTERED_STATS_GAMES}
      ) AND ${guard}
    `).bind(scope, writeToken));
  }
  if (week !== undefined) {
    statements.push(database.prepare(`UPDATE team_settings SET schedule_week=? WHERE id=1 AND ${guard}`)
      .bind(week, scope, writeToken));
    statements.push(database.prepare(`DELETE FROM schedule_lineups WHERE schedule_id IN (SELECT id FROM schedule_games WHERE date<?)
        AND schedule_id NOT IN (${retainedLineupScheduleSql()}) AND ${guard}`)
      .bind(japanDate(now), japanDate(now), scope, writeToken));
  }

  // D1 batch is transactional: FK failures also roll back the revision change.
  const results = await database.batch<{ revision: number }>(statements);
  return results[0].results[0]?.revision ?? null;
}

export function teamScheduleMetadata(snapshot: Snapshot) {
  const schedule = snapshot.related?.tables ? decodeData("schedule", snapshot.related.tables) as ScheduleData : null;
  const selectedId = snapshot.tables?.team_settings[0]?.[8];
  const selectedDate = snapshot.tables?.team_settings[0]?.[4];
  const today = japanDate();
  return {
    scheduleRevision: snapshot.related?.revision ?? 0,
    schedules: schedule?.games.filter((game) => game.date >= today || game.id === selectedId || game.date === selectedDate)
      .map((game) => ({ id: game.id, date: game.date, startTime: game.startTime, endTime: game.endTime, title: game.title, opponent: game.opponent, location: game.location, mapUrl: game.mapUrl, status: game.status, umpireArranged: game.umpireArranged, detailsRevision: game.detailsRevision, previousStartTime: game.previousStartTime, previousEndTime: game.previousEndTime, previousLocation: game.previousLocation, changedBy: game.changedBy })) ?? [],
    attendance: schedule?.games.find((game) => game.id === selectedId)?.responses ?? {},
    attendanceScheduleId: (selectedId as string | null | undefined) ?? null,
  };
}

/** Authenticated read fallback also performs the rollover if the cron was missed. */
export async function synchronizeTeamSnapshot(snapshot: Snapshot, database: D1Database = db(), now = new Date(), authenticated = true): Promise<"unchanged" | "changed" | "conflict"> {
  if (!snapshot.tables || !snapshot.related?.tables) return "unchanged";
  const team = decodeData("team", snapshot.tables) as TeamData;
  const schedule = decodeData("schedule", snapshot.related.tables) as ScheduleData;
  const projected = projectScheduleOrder(team, schedule, snapshot.week ?? "", now, { lineups: decodeLineups(snapshot.lineups) });
  const next = encodeData("team", projected.data);
  const stored = lineupChanges(snapshot.lineups, team, projected.data, schedule, now);
  const group = { scope: "team" as const, revision: snapshot.revision, changes: [...changesBetween("team", snapshot.tables, next), ...stored.changes] };
  const week = projected.week !== snapshot.week ? projected.week : undefined;
  if (!hasChanges(group) && week === undefined) return "unchanged";
  const revision = await commitChanges(database, [group], { scope: "schedule", revision: snapshot.related.revision },
    authenticated ? { sessionHash: snapshot.sessionHash, member: snapshot.member } : undefined, week, now);
  // Re-read on CAS failure too, so the caller never returns a stale pre-rollover state.
  if (revision !== null) {
    snapshot.revision = revision;
    snapshot.tables = next;
    snapshot.week = projected.week;
    snapshot.lineups = stored.next;
  }
  return revision === null ? "conflict" : "changed";
}

/** Trusted cron entry point. It has no HTTP route and cannot bypass API permissions. */
export async function syncScheduledOrder(database: D1Database, now = new Date()): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const selection = scheduleSelectionSql("team", {}, now);
    const result = await database.prepare(`${selection.sql} SELECT r.revision, related.revision AS related_revision, settings.schedule_week,
      ${snapshotSql("team", false)} AS team_data, ${snapshotSql("schedule", false)} AS schedule_data, ${lineupSnapshotSql()} AS lineup_data
      FROM app_revisions r JOIN app_revisions related ON related.scope='schedule'
      JOIN team_settings settings ON settings.id=1 WHERE r.scope='team'`)
      .bind(...selection.values).first<{ revision: number; related_revision: number; schedule_week: string; team_data: string; schedule_data: string; lineup_data: string }>();
    if (!result) throw new Error("Schedule migration is incomplete");
    const outcome = await synchronizeTeamSnapshot({
      revision: result.revision, tables: JSON.parse(result.team_data), week: result.schedule_week,
      related: { revision: result.related_revision, tables: JSON.parse(result.schedule_data) },
      lineups: JSON.parse(result.lineup_data),
      sessionHash: "", member: { id: "", name: "", number: "", isAdmin: false, canEditLineup: false },
    }, database, now, false);
    if (outcome !== "conflict") return outcome === "changed";
  }
  throw new Error("Schedule rollover conflicted with another save; retry the job");
}
