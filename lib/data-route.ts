import { validateData, type TeamData } from "./model";
import { validateEquipmentData } from "./equipment";
import { validateAccountingData } from "./accounting";
import { AccountingPermissionError } from "./normalized-store";
import { gameKey, parseGameKey, validateStatsData, type StatsData } from "./stats";
import { SCHEDULE_LIMITS, validateScheduleData, type ScheduleData } from "./schedule";
import { getSession, json, readBody, renewSessionHeaders, sameOrigin } from "./server";
import { decodeData, encodeData, readSnapshot, writeChanges, synchronizeTeamSnapshot, teamScheduleMetadata, statsScheduleMetadata, statsLineupMetadata, mergeScheduleChanges, SCHEDULE_PAGE_SIZE, StatsPermissionError, StatsScheduleError, LineupPermissionError, SchedulePermissionError, TeamSettingsPermissionError, type DataScope, type ScopeData, type ScheduleQuery } from "./normalized-store";

const validators = { team: validateData, equipment: validateEquipmentData, stats: validateStatsData, schedule: validateScheduleData, accounting: validateAccountingData };
const labels = { team: "チーム", equipment: "道具", stats: "成績", schedule: "スケジュール", accounting: "会計" };
const conflict = () => json({ error: "別の端末で更新されています。編集中の内容を確認して、最新データを読み込んでください。" }, 409);

function validScheduleId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= SCHEDULE_LIMITS.id && value.trim() === value;
}

function scheduleQuery(params: URLSearchParams): ScheduleQuery {
  const id = params.get("id");
  const past = params.get("past");
  const beforeDate = params.get("beforeDate");
  const beforeId = params.get("beforeId");
  if (id !== null) {
    if (!validScheduleId(id) || past !== null || beforeDate !== null || beforeId !== null) throw new Error("Invalid schedule selection");
    return { kind: "single", id };
  }
  if (past === null) {
    if (beforeDate !== null || beforeId !== null) throw new Error("Unexpected schedule cursor");
    return { kind: "upcoming" };
  }
  if (past !== "1") throw new Error("Invalid schedule page");
  if (beforeDate === null && beforeId === null) return { kind: "past" };
  if (beforeDate === null || !validScheduleId(beforeId) || !/^\d{4}-\d{2}-\d{2}$/.test(beforeDate) || beforeDate.startsWith("0000-")) {
    throw new Error("Invalid schedule cursor");
  }
  const date = new Date(`${beforeDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== beforeDate) throw new Error("Invalid schedule date");
  return { kind: "past", before: { date: beforeDate, id: beforeId } };
}

export function dataRoute(scope: DataScope) {
  return {
    async GET(req: Request) {
      try {
        const params = new URL(req.url).searchParams;
        const revisionParam = params.get("revision");
        const revision = revisionParam === null ? null : Number(revisionParam);
        const scheduleRevision = params.has("scheduleRevision") ? Number(params.get("scheduleRevision")) : undefined;
        if (scheduleRevision !== undefined && (!Number.isSafeInteger(scheduleRevision) || scheduleRevision < 0)) return json({ error: "更新番号が不正です。" }, 400);
        if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) {
          return json({ error: "更新番号が不正です。" }, 400);
        }
        let query: ScheduleQuery | undefined;
        try {
          if (scope === "schedule") query = scheduleQuery(params);
        } catch {
          return json({ error: "取得する予定・ページの指定を確認してください。" }, 400);
        }
        let snapshot = await readSnapshot(req, scope, revision === null ? undefined : { revision, mode: "changed", scheduleRevision }, undefined, { schedule: query });
        if (!snapshot) return json({ error: "ログインしてください。" }, 401);
        if (scope === "team" && snapshot.tables) {
          // Successful projections update the in-memory snapshot, avoiding a second SELECT.
          const outcome = await synchronizeTeamSnapshot(snapshot);
          if (outcome === "conflict") {
            snapshot = await readSnapshot(req, scope);
            if (!snapshot) return json({ error: "ログインしてください。" }, 401);
            if (await synchronizeTeamSnapshot(snapshot) === "conflict") return conflict();
          }
        }
        const headers = renewSessionHeaders(req);
        if (!snapshot.tables) return json({ revision: snapshot.revision, unchanged: true, member: snapshot.member }, 200, headers);
        if (scope === "schedule") {
          const data = decodeData("schedule", snapshot.tables) as ScheduleData;
          const hasMore = query?.kind === "past" && data.games.length > SCHEDULE_PAGE_SIZE;
          if (hasMore) data.games = data.games.slice(0, SCHEDULE_PAGE_SIZE);
          const last = data.games.at(-1);
          return json({ data, revision: snapshot.revision, member: snapshot.member, hasMore,
            nextCursor: hasMore && last ? { date: last.date, id: last.id } : null }, 200, headers);
        }
        return json({ data: decodeData(scope, snapshot.tables), revision: snapshot.revision, member: snapshot.member,
          ...(scope === "team" ? teamScheduleMetadata(snapshot) : scope === "stats" ? { ...statsScheduleMetadata(snapshot), ...statsLineupMetadata(snapshot) } : {}) }, 200, headers);
      } catch {
        return json({ error: `${labels[scope]}データを読み込めませんでした。再試行してください。` }, 503);
      }
    },
    async PUT(req: Request) {
      if (!sameOrigin(req)) return json({ error: "リクエストを確認できません。" }, 403);
      try {
        if (scope === "accounting") {
          const session = await getSession(req);
          if (!session?.member) return json({ error: "再ログインしてください。" }, 401);
          if (session.member.isAdmin !== true) return json({ error: "会計を編集できるのは管理者だけです。" }, 403);
        }
        let data: ScopeData[DataScope];
        let revision: number;
        let gameKeys: string[] | undefined;
        let removedSchedules: string[] = [];
        let changedScheduleIds: string[] | undefined;
        let scheduleSelection: ScheduleQuery | undefined;
        try {
          const input = await readBody(req);
          if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("Invalid revision");
          revision = input.revision;
          data = validators[scope](input.data);
          if (scope === "schedule") {
            // Full-list saves from old clients are rejected: unloaded pages must
            // never be interpreted as events the user intended to delete.
            if (input.partial !== true || !Array.isArray(input.removedGames) ||
                input.removedGames.length > SCHEDULE_LIMITS.games || !input.removedGames.every(validScheduleId)) {
              throw new Error("Partial schedule save is required");
            }
            changedScheduleIds = (data as ScheduleData).games.map((game) => game.id);
            removedSchedules = [...new Set<string>(input.removedGames)];
            if (removedSchedules.some((id) => changedScheduleIds!.includes(id))) throw new Error("Conflicting schedule changes");
            scheduleSelection = { kind: "write", ids: [...changedScheduleIds, ...removedSchedules] };
          }
          if (scope === "stats" && input.partial === true) {
            if (!Array.isArray(input.removedGames) || input.removedGames.some((key: unknown) => {
              if (typeof key !== "string") return true;
              const parsed = parseGameKey(key);
              return !parsed || gameKey(parsed.date, parsed.number) !== key;
            })) throw new Error("Invalid removed games");
            const changed = Object.keys((data as StatsData).games);
            if (input.removedGames.some((key: string) => changed.includes(key))) throw new Error("Conflicting game changes");
            gameKeys = [...new Set<string>([...changed, ...input.removedGames])];
          }
        } catch {
          return json({ error: `${labels[scope]}の入力内容・保存情報を確認してください。` }, 400);
        }
        // Authentication and the baseline read share a single SELECT. A stale
        // revision returns without scanning the domain's child tables.
        const snapshot = await readSnapshot(req, scope, { revision, mode: "matching" }, gameKeys, {
          schedule: scheduleSelection,
          ...(scope === "team" ? { team: data as TeamData } : {}),
        });
        if (!snapshot) return json({ error: "再ログインしてください。" }, 401);
        if (scope === "accounting" && snapshot.member.isAdmin !== true) throw new AccountingPermissionError();
        if (snapshot.revision !== revision) return conflict();
        if (scope === "schedule") data = mergeScheduleChanges(snapshot, data as ScheduleData, removedSchedules);
        const result = await writeChanges(scope, snapshot, encodeData(scope, data), changedScheduleIds);
        if (result === null) return conflict();
        if (scope === "stats") {
          const saved = await readSnapshot(req, "stats", { revision: result.revision, mode: "matching" });
          if (!saved) return json({ error: "再ログインしてください。" }, 401);
          if (!saved.tables || saved.revision !== result.revision) return conflict();
          return json({ revision: saved.revision, data: decodeData("stats", saved.tables), ...statsLineupMetadata(saved) }, 200, renewSessionHeaders(req));
        }
        if (scope === "team" && result.data) {
          snapshot.tables = encodeData("team", result.data);
          return json({ ...result, member: snapshot.member, ...teamScheduleMetadata(snapshot) }, 200, renewSessionHeaders(req));
        }
        return json(result, 200, renewSessionHeaders(req));
      } catch (error) {
        if (error instanceof AccountingPermissionError) return json({ error: error.message }, 403);
        if (error instanceof StatsScheduleError) return json({ error: error.message }, 400);
        if (scope === "stats" && error instanceof Error && /UNIQUE constraint failed: stats_games.schedule_id/i.test(error.message)) {
          return json({ error: "この試合には別の成績が登録されています。最新データを読み込んでください。" }, 409);
        }
        if (error instanceof StatsPermissionError || error instanceof LineupPermissionError || error instanceof SchedulePermissionError || error instanceof TeamSettingsPermissionError) return json({ error: error.message }, 403);
        if (error instanceof Error && /FOREIGN KEY constraint failed/i.test(error.message)) {
          return json({ error: "参照先の選手・試合がありません。最新データを読み込んでください。" }, 400);
        }
        return json({ error: `${labels[scope]}データを保存できませんでした。入力内容は画面に残っています。` }, 503);
      }
    },
  };
}

/** 過去の試合候補だけを20件ずつ取得する。成績・出欠の明細は取得しない。 */
export async function statsScheduleOptionsRoute(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    params.set("past", "1");
    let query: ScheduleQuery;
    try { query = scheduleQuery(params); } catch { return json({ error: "取得する試合の指定を確認してください。" }, 400); }
    if (query.kind !== "past") return json({ error: "過去の試合を指定してください。" }, 400);
    const snapshot = await readSnapshot(req, "stats", undefined, [], { statsPageOnly: true, statsBefore: query.before });
    if (!snapshot) return json({ error: "ログインしてください。" }, 401);
    return json(statsScheduleMetadata(snapshot), 200, renewSessionHeaders(req));
  } catch {
    return json({ error: "試合の候補を読み込めませんでした。" }, 503);
  }
}
