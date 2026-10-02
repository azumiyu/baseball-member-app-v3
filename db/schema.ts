import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, blob, primaryKey, foreignKey, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

// Legacy JSON backups retained by 0003_normalize_data; application reads/writes
// use the normalized tables below. Do not drop these until backups are archived.
export const teamState = sqliteTable("team_state", {
    id: integer("id").primaryKey(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
});
export const equipmentState = sqliteTable("equipment_state", {
    id: integer("id").primaryKey(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
});
export const statsState = sqliteTable("stats_state", {
    id: integer("id").primaryKey(),
    data: text("data").notNull(),
    revision: integer("revision").notNull().default(0),
});

export const appRevisions = sqliteTable("app_revisions", {
    scope: text("scope").primaryKey(),
    revision: integer("revision").notNull().default(0),
    writeToken: text("write_token").notNull().default(""),
});

export const players = sqliteTable("players", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    number: text("number").notNull(),
    kana: text("kana").notNull(),
    // Authorization belongs to the stable member ID, not the editable name.
    isAdmin: integer("is_admin").notNull().default(0),
    canEditLineup: integer("can_edit_lineup").notNull().default(0),
    // NULL retains a former member for equipment/statistics references.
    sortOrder: integer("sort_order"),
    benchOrder: integer("bench_order"),
    absentOrder: integer("absent_order"),
}, (table) => [index("players_active_sort_order_idx").on(table.sortOrder).where(sql`sort_order IS NOT NULL`)]);

export const teamSettings = sqliteTable("team_settings", {
    id: integer("id").primaryKey(),
    teamName: text("team_name").notNull(),
    manager: text("manager").notNull(),
    tournament: text("tournament").notNull(),
    gameDate: text("game_date").notNull(),
    opponent: text("opponent").notNull(),
    scheduleId: text("schedule_id").references(() => scheduleGames.id, { onDelete: "set null" }),
    startTime: text("start_time").notNull().default(""),
    location: text("location").notNull().default(""),
    mapUrl: text("map_url").notNull().default(""),
    scheduleWeek: text("schedule_week").notNull().default(""),
    mode: text("mode").notNull(),
    pitcherId: text("pitcher_id").references(() => players.id),
});

export const nameOptions = sqliteTable("name_options", {
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
}, (table) => [primaryKey({ columns: [table.kind, table.name] })]);

export const lineupSlots = sqliteTable("lineup_slots", {
    battingOrder: integer("batting_order").primaryKey(),
    position: text("position").notNull(),
    playerId: text("player_id").references(() => players.id),
});

export const equipmentItems = sqliteTable("equipment_items", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    holderId: text("holder_id").references(() => players.id),
    note: text("note").notNull(),
    sortOrder: integer("sort_order").notNull(),
    notifyLine: integer("notify_line").notNull().default(1),
}, (table) => [check("equipment_items_notify_line_check", sql`${table.notifyLine} IN (0, 1)`)]);

export const scheduleGames = sqliteTable("schedule_games", {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    startTime: text("start_time").notNull().default(""),
    endTime: text("end_time").notNull().default(""),
    title: text("title").notNull().default(""),
    opponent: text("opponent").notNull().default(""),
    location: text("location").notNull().default(""),
    mapUrl: text("map_url").notNull().default(""),
    status: text("status").notNull().default("unconfirmed"),
    detailsRevision: integer("details_revision").notNull().default(1),
    previousStartTime: text("previous_start_time"),
    previousEndTime: text("previous_end_time"),
    previousLocation: text("previous_location"),
    changedBy: text("changed_by").references(() => players.id),
    umpireArranged: integer("umpire_arranged").notNull().default(0),
}, (table) => [
    index("schedule_games_date_start_time_idx").on(table.date, table.startTime),
    index("schedule_games_date_id_idx").on(table.date, table.id),
    check("schedule_games_status_check", sql`${table.status} IN ('unconfirmed', 'proposed', 'confirmed')`),
    check("schedule_games_details_revision_check", sql`${table.detailsRevision} >= 1`),
    check("schedule_games_umpire_arranged_check", sql`${table.umpireArranged} IN (0, 1)`),
]);

export const scheduleResponses = sqliteTable("schedule_responses", {
    scheduleId: text("schedule_id").notNull().references(() => scheduleGames.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull().references(() => players.id),
    status: text("status").notNull(),
    comment: text("comment").notNull().default(""),
    confirmedRevision: integer("confirmed_revision").notNull().default(1),
}, (table) => [
    primaryKey({ columns: [table.scheduleId, table.playerId] }),
    check("schedule_responses_status_check", sql`${table.status} IN ('attending', 'absent', 'undecided')`),
    check("schedule_responses_confirmed_revision_check", sql`${table.confirmedRevision} >= 0`),
]);

export const scheduleLineups = sqliteTable("schedule_lineups", {
    scheduleId: text("schedule_id").primaryKey().references(() => scheduleGames.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    pitcherId: text("pitcher_id").references(() => players.id),
});

export const scheduleLineupSlots = sqliteTable("schedule_lineup_slots", {
    scheduleId: text("schedule_id").notNull().references(() => scheduleLineups.scheduleId, { onDelete: "cascade" }),
    battingOrder: integer("batting_order").notNull(),
    position: text("position").notNull(),
    playerId: text("player_id").references(() => players.id),
}, (table) => [primaryKey({ columns: [table.scheduleId, table.battingOrder] })]);

export const statsGames = sqliteTable("stats_games", {
    gameDate: text("game_date").notNull(),
    gameNumber: integer("game_number").notNull(),
    // Preserve the historical stats key when a schedule is edited or deleted.
    scheduleId: text("schedule_id").references(() => scheduleGames.id, { onDelete: "set null" }),
}, (table) => [
    primaryKey({ columns: [table.gameDate, table.gameNumber] }),
    uniqueIndex("stats_games_schedule_id_unique").on(table.scheduleId),
]);

export const playerGameStats = sqliteTable("player_game_stats", {
    gameDate: text("game_date").notNull(),
    gameNumber: integer("game_number").notNull(),
    playerId: text("player_id").notNull().references(() => players.id),
    rbis: integer("rbis").notNull().default(0),
    runs: integer("runs").notNull().default(0),
    stolenBases: integer("stolen_bases").notNull().default(0),
    caughtStealingAttempts: integer("caught_stealing_attempts").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    caughtStealing: integer("caught_stealing").notNull().default(0),
}, (table) => [
    primaryKey({ columns: [table.gameDate, table.gameNumber, table.playerId] }),
    foreignKey({
        columns: [table.gameDate, table.gameNumber],
        foreignColumns: [statsGames.gameDate, statsGames.gameNumber],
    }).onDelete("cascade"),
]);

export const plateAppearances = sqliteTable("plate_appearances", {
    gameDate: text("game_date").notNull(),
    gameNumber: integer("game_number").notNull(),
    playerId: text("player_id").notNull(),
    appearanceOrder: integer("appearance_order").notNull(),
    result: text("result"),
    scoringPosition: integer("scoring_position").notNull().default(0),
}, (table) => [
    primaryKey({ columns: [table.gameDate, table.gameNumber, table.playerId, table.appearanceOrder] }),
    foreignKey({
        columns: [table.gameDate, table.gameNumber, table.playerId],
        foreignColumns: [playerGameStats.gameDate, playerGameStats.gameNumber, playerGameStats.playerId],
    }).onDelete("cascade"),
]);

// Keep one resumable run and one personal best per member and game.
// result_json contains only the last turn's animation, not a growing history.
export const miniGameRuns = sqliteTable("mini_game_runs", {
    gameId: text("game_id").notNull(),
    playerId: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    turn: integer("turn").notNull().default(0),
    balance: integer("balance").notNull(),
    status: text("status").notNull(),
    lastRequestId: text("last_request_id").notNull(),
    resultJson: text("result_json").notNull().default("null"),
    startedAt: integer("started_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (table) => [
    primaryKey({ columns: [table.gameId, table.playerId] }),
    check("mini_game_runs_turn_check", sql`${table.turn} >= 0`),
    check("mini_game_runs_balance_check", sql`${table.balance} >= 0`),
    check("mini_game_runs_status_check", sql`${table.status} IN ('playing', 'finished')`),
]);

export const miniGameScores = sqliteTable("mini_game_scores", {
    gameId: text("game_id").notNull(),
    playerId: text("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    achievedAt: integer("achieved_at").notNull(),
}, (table) => [
    primaryKey({ columns: [table.gameId, table.playerId] }),
    index("mini_game_scores_ranking_idx").on(table.gameId, sql`${table.score} DESC`, sql`${table.achievedAt} ASC`, sql`${table.playerId} ASC`),
    check("mini_game_scores_score_check", sql`${table.score} >= 0`),
]);

export const accountingEntries = sqliteTable("accounting_entries", {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    category: text("category").notNull(),
    income: integer("income").notNull(),
    expense: integer("expense").notNull(),
    createdBy: text("created_by").notNull().references(() => players.id),
    createdAt: integer("created_at").notNull(),
}, (table) => [
    index("accounting_entries_date_idx").on(sql`${table.date} DESC`, sql`${table.createdAt} DESC`, table.id),
    check("accounting_entries_category_check", sql`length(trim(${table.category})) BETWEEN 1 AND 100`),
    check("accounting_entries_income_check", sql`typeof(${table.income}) = 'integer' AND ${table.income} BETWEEN 0 AND 9007199254740991`),
    check("accounting_entries_expense_check", sql`typeof(${table.expense}) = 'integer' AND ${table.expense} BETWEEN 0 AND 9007199254740991`),
    check("accounting_entries_amount_check", sql`${table.income} > 0 OR ${table.expense} > 0`),
]);

export const membershipPayments = sqliteTable("membership_payments", {
    year: integer("year").notNull(),
    playerId: text("player_id").notNull().references(() => players.id),
    paid: integer("paid").notNull().default(0),
    paidAt: integer("paid_at"),
}, (table) => [
    primaryKey({ columns: [table.year, table.playerId] }),
    check("membership_payments_year_check", sql`${table.year} BETWEEN 1900 AND 9999`),
    check("membership_payments_paid_check", sql`${table.paid} IN (0, 1)`),
    check("membership_payments_paid_at_check", sql`(${table.paid} = 0 AND ${table.paidAt} IS NULL) OR (${table.paid} = 1 AND ${table.paidAt} IS NOT NULL)`),
]);

export const homeNotices = sqliteTable("home_notices", {
    id: text("id").primaryKey(),
    date: text("date").notNull().default(""),
    text: text("text").notNull(),
    published: integer("published").notNull().default(0),
    sortOrder: integer("sort_order").notNull(),
}, (table) => [
    check("home_notices_text_check", sql`length(trim(${table.text})) BETWEEN 1 AND 180`),
    check("home_notices_published_check", sql`${table.published} IN (0, 1)`),
]);

export const homeColumns = sqliteTable("home_columns", {
    id: text("id").primaryKey(),
    date: text("date").notNull().default(""),
    title: text("title").notNull(),
    body: text("body").notNull(),
    imageUrl: text("image_url").notNull().default(""),
    imageAlt: text("image_alt").notNull().default(""),
    linkUrl: text("link_url").notNull().default(""),
    linkLabel: text("link_label").notNull().default(""),
    published: integer("published").notNull().default(0),
    sortOrder: integer("sort_order").notNull(),
}, (table) => [
    check("home_columns_title_check", sql`length(trim(${table.title})) BETWEEN 1 AND 100`),
    check("home_columns_body_check", sql`length(trim(${table.body})) BETWEEN 1 AND 4000`),
    check("home_columns_published_check", sql`${table.published} IN (0, 1)`),
]);

export const homeImages = sqliteTable("home_images", {
    id: text("id").primaryKey(),
    contentType: text("content_type").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    byteSize: integer("byte_size").notNull(),
    createdBy: text("created_by").notNull().references(() => players.id),
    createdAt: integer("created_at").notNull(),
}, (table) => [
    check("home_images_type_check", sql`${table.contentType} IN ('image/jpeg', 'image/png', 'image/webp')`),
    check("home_images_size_check", sql`typeof(${table.data}) = 'blob' AND ${table.byteSize} BETWEEN 1 AND 786432 AND length(${table.data}) = ${table.byteSize}`),
]);

export const authConfig = sqliteTable("auth_config", {
    id: integer("id").primaryKey(),
    salt: text("salt").notNull(),
    hash: text("hash").notNull(),
});
export const memberDevices = sqliteTable("member_devices", {
    hash: text("hash").primaryKey(),
    playerId: text("player_id").notNull().references(() => players.id),
});
export const sessions = sqliteTable("sessions", {
    hash: text("hash").primaryKey(),
    // 0 means no server-side expiry; existing finite sessions retain their expiry.
    expires: integer("expires").notNull(),
    deviceHash: text("device_hash").references(() => memberDevices.hash),
});
export const loginAttempts = sqliteTable("login_attempts", {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    until: integer("until").notNull(),
});
