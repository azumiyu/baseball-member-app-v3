import type { AuthMember } from "../auth-types";
import { db, digest, random, token, validToken } from "../server";
import type { LeaderboardEntry } from "./api-types";
import { MARATHON, marathonAvailableWaterMl, marathonJapanDate, marathonJapanDayEnd,
  marathonMood, marathonNoWaterWindow, marathonWaitMs, rollMarathonGacha,
  type MarathonSnapshot, type MarathonState, type MarathonSteal, type MarathonStealNotification,
  type MarathonStealRequest, type MarathonWater, type MarathonWaterRequest } from "./marathon";

type Score = Omit<LeaderboardEntry, "rank">;
type ContextRow = {
  id: string; name: string; number: string; is_admin: number; can_edit_lineup: number;
  started_at: number; last_watered_at: number; revision: number; total_water_ml: number;
  last_giver_name: string | null; exclusive_player_id: string | null; exclusive_player_name: string | null;
  exclusive_until: number; japan_date: string | null; daily_water_count: number | null; daily_steal_count: number | null;
  receipt_json: string | null; last_steal_request_id: string | null; last_steal_result_json: string | null;
  pending_steal_count: number | null; pending_steal_ml: number | null;
  pending_steal_last_giver_name: string | null; pending_steal_version: number | null; scores_json: string;
};
export type MarathonContext = {
  member: AuthMember; sessionHash: string; state: MarathonState;
  scores: Score[]; dailyWaterCount: number; lastWater: MarathonWater | null;
  dailyStealCount: number; stealTargetCount: number; lastSteal: MarathonSteal | null;
  pendingStealNotification: MarathonStealNotification | null;
};

// One indexed query authenticates and returns the shared timestamps, ranking,
// and this member's last receipt. It never updates distance or thirst in D1.
export async function readMarathonContext(req: Request): Promise<MarathonContext | null> {
  const value = token(req);
  if (!validToken(value)) return null;
  const sessionHash = await digest(value);
  const now = Date.now();
  const row = await db().prepare(`
    SELECT p.id,p.name,p.number,p.is_admin,p.can_edit_lineup,
      m.started_at,m.last_watered_at,m.revision,m.total_water_ml,m.last_giver_name,
      m.exclusive_player_id,(SELECT name FROM players WHERE id=m.exclusive_player_id) AS exclusive_player_name,
      m.exclusive_until,
      g.japan_date,g.water_count AS daily_water_count,g.steal_count AS daily_steal_count,
      g.last_steal_request_id,g.last_steal_result_json,
      g.pending_steal_count,g.pending_steal_ml,g.pending_steal_last_giver_name,g.pending_steal_version,
      (SELECT r.result_json FROM mini_game_runs r WHERE r.game_id=? AND r.player_id=p.id) AS receipt_json,
      (SELECT json_group_array(json_object('playerId',scores.player_id,'name',scores.name,
        'number',scores.number,'score',scores.score,'achievedAt',scores.achieved_at))
       FROM (SELECT s.player_id,s.score,s.achieved_at,players.name,players.number
         FROM mini_game_scores s JOIN players ON players.id=s.player_id AND players.sort_order IS NOT NULL
         WHERE s.game_id=? ORDER BY s.score DESC,s.achieved_at,s.player_id) scores) AS scores_json
    FROM sessions session JOIN member_devices device ON device.hash=session.device_hash
    JOIN players p ON p.id=device.player_id AND p.sort_order IS NOT NULL
    LEFT JOIN marathon_giver_limits g ON g.player_id=p.id
    JOIN marathon_state m ON m.id=1
    WHERE session.hash=? AND (session.expires=0 OR session.expires>?)
  `).bind(MARATHON.gameId, MARATHON.gameId, sessionHash, now).first<ContextRow>();
  if (!row) return null;
  const scores = JSON.parse(row.scores_json) as Score[];
  const ownIndex = scores.findIndex((score) => score.playerId === row.id);
  const ownScore = ownIndex >= 0 ? scores[ownIndex]?.score ?? 0 : 0;
  const eligibleTargets = getEligibleStealTargets(scores, row.id, ownIndex);
  const today = marathonJapanDate(now);
  const pendingStealNotification = (row.pending_steal_count ?? 0) > 0
    ? { version: row.pending_steal_version ?? 0, count: row.pending_steal_count ?? 0,
        stolenMl: row.pending_steal_ml ?? 0, lastGiverName: row.pending_steal_last_giver_name ?? "メンバー" }
    : null;
  return {
    member: { id: row.id, name: row.name, number: row.number,
      isAdmin: row.is_admin === 1, canEditLineup: row.can_edit_lineup === 1 },
    sessionHash,
    state: { startedAt: row.started_at, lastWateredAt: row.last_watered_at, revision: row.revision,
      totalWaterMl: row.total_water_ml, lastGiverName: row.last_giver_name,
      exclusivePlayerId: row.exclusive_player_id, exclusivePlayerName: row.exclusive_player_name,
      exclusiveUntil: row.exclusive_until },
    scores,
    dailyWaterCount: row.japan_date === today ? row.daily_water_count ?? 0 : 0,
    lastWater: row.receipt_json ? JSON.parse(row.receipt_json) as MarathonWater : null,
    dailyStealCount: row.japan_date === today ? row.daily_steal_count ?? 0 : 0,
    stealTargetCount: ownScore >= MARATHON.stealMinimumScoreMl ? eligibleTargets.length : 0,
    lastSteal: row.last_steal_request_id && row.last_steal_result_json
      ? JSON.parse(row.last_steal_result_json) as MarathonSteal : null,
    pendingStealNotification,
  };
}

export function marathonSnapshot(context: MarathonContext, serverNow = Date.now()): MarathonSnapshot {
  const ranked = context.scores.map((score, index) => ({ ...score, rank: index + 1 }));
  return { member: context.member, gameId: MARATHON.gameId, run: null, serverNow,
    state: context.state, dailyWaterCount: context.dailyWaterCount, lastWater: context.lastWater,
    dailyStealCount: context.dailyStealCount, stealTargetCount: context.stealTargetCount,
    lastSteal: context.lastSteal, pendingStealNotification: context.pendingStealNotification,
    leaderboard: ranked.slice(0, 10),
    personalBest: ranked.find((score) => score.playerId === context.member.id) ?? null };
}

function getEligibleStealTargets(scores: Score[], playerId: string, ownIndex: number): Score[] {
  if (ownIndex < 0) return [];
  const ahead = ownIndex === 0 ? scores.filter((score) => score.playerId !== playerId) : scores.slice(0, ownIndex);
  return ahead.filter((score) => score.score >= 20);
}

function secureIndex(length: number): number {
  const bound = Math.floor(0x1_0000_0000 / length) * length;
  let value = 0;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0; } while (value >= bound);
  return value % length;
}

function rollStealPercent(): number {
  const roll = secureIndex(100);
  let boundary = 0;
  for (const item of MARATHON.stealPercentWeights) {
    boundary += item.weight;
    if (roll < boundary) return item.percent;
  }
  return 5;
}

export function parseMarathonRequest(value: unknown): MarathonWaterRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { requestId, expectedRevision } = value as Record<string, unknown>;
  return typeof requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
    && Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0
    ? { requestId, expectedRevision: expectedRevision as number } : null;
}

export function parseMarathonStealRequest(value: unknown): MarathonStealRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { requestId, expectedRevision } = value as Record<string, unknown>;
  return typeof requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
    && Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0
    ? { requestId, expectedRevision: expectedRevision as number } : null;
}

export function parseMarathonNotificationVersion(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const version = (value as Record<string, unknown>).version;
  return Number.isSafeInteger(version) && (version as number) > 0 ? version as number : null;
}

export type MarathonWaterResult = { status: "accepted" | "duplicate" | "conflict" | "waiting" | "resting" | "daily-limit" | "exclusive" | "unauthorized"; context: MarathonContext | null };

/** D1 serializes the transactional batch. Exactly one CAS can consume the
 * shared thirst; a new server token guards both credit and receipt writes.
 * Duplicate in-flight requests can therefore never add the same water twice. */
export async function waterMarathon(req: Request, context: MarathonContext, request: MarathonWaterRequest): Promise<MarathonWaterResult> {
  if (context.lastWater?.requestId === request.requestId) return { status: "duplicate", context };
  if (context.state.revision !== request.expectedRevision) return { status: "conflict", context };
  const now = Date.now();
  if (marathonNoWaterWindow(now).isResting) return { status: "resting", context };
  if (marathonWaitMs(context.state, now) > 0) return { status: "waiting", context };
  if (context.dailyWaterCount >= MARATHON.dailyWaterLimit) return { status: "daily-limit", context };
  if (context.state.exclusiveUntil > now && context.state.exclusivePlayerId !== context.member.id) return { status: "exclusive", context };

  const baseAmountMl = marathonAvailableWaterMl(context.state, now);
  const mood = marathonMood(context.state, now);
  const gacha = rollMarathonGacha();
  const leader = context.scores[0];
  const stolenMl = gacha.kind === "steal" && leader && leader.playerId !== context.member.id
    ? Math.floor(leader.score * 0.1) : 0;
  const didSteal = stolenMl > 0 && !!leader && leader.playerId !== context.member.id;
  const exclusive = gacha.kind === "exclusive";
  const regularWaterMultiplier = gacha.kind === "steal" ? 1 : gacha.multiplier;
  const amountMl = didSteal ? stolenMl : Math.floor(baseAmountMl * regularWaterMultiplier);
  const gachaLabel = gacha.kind === "steal" && !didSteal
    ? leader?.playerId === context.member.id
      ? "1位はあなたなので、通常給水になりました"
      : "1位の給水量がまだ少ないため、通常給水になりました"
    : gacha.label;
  const multiplier = didSteal ? 1 : mood.multiplier * regularWaterMultiplier;
  const receipt: MarathonWater = {
    requestId: request.requestId, amountMl, wateredAt: now, mood: mood.kind, multiplier,
    moodMultiplier: mood.multiplier, gacha: gacha.kind, gachaLabel,
    gachaMultiplier: didSteal ? 1 : regularWaterMultiplier,
    stolenFromName: didSteal ? leader?.name ?? null : null,
  };
  const writeToken = random();
  const database = db();
  const japanDate = marathonJapanDate(now);
  const notResting = marathonNoWaterWindow(now).isResting ? 0 : 1;
  const statements = [database.prepare(`
    UPDATE marathon_state SET last_watered_at=?,revision=revision+1,total_water_ml=total_water_ml+?,
      last_giver_name=?,write_token=?,
      exclusive_player_id=CASE WHEN ?=1 THEN ? ELSE exclusive_player_id END,
      exclusive_until=CASE WHEN ?=1 THEN ? ELSE exclusive_until END
    WHERE id=1 AND revision=? AND last_watered_at<=? AND ?=1
      AND (exclusive_until<=? OR exclusive_player_id=?)
      AND COALESCE((SELECT water_count FROM marathon_giver_limits WHERE player_id=? AND japan_date=?),0)<?
      AND EXISTS (SELECT 1 FROM sessions s JOIN member_devices d ON d.hash=s.device_hash
        JOIN players p ON p.id=d.player_id WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
          AND p.id=? AND p.sort_order IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM mini_game_runs WHERE game_id=? AND player_id=? AND last_request_id=?)
  `).bind(now, didSteal ? 0 : amountMl, context.member.name, writeToken,
    exclusive ? 1 : 0, context.member.id, exclusive ? 1 : 0, marathonJapanDayEnd(now),
    request.expectedRevision, now - MARATHON.minWaterIntervalMs, notResting, now, context.member.id,
    context.member.id, japanDate, MARATHON.dailyWaterLimit, context.sessionHash, now,
    context.member.id, MARATHON.gameId, context.member.id, request.requestId)];

  if (didSteal && leader) {
    statements.push(database.prepare(`
      UPDATE mini_game_scores SET score=score-?,achieved_at=?
      WHERE game_id=? AND player_id=? AND score>=? AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(amountMl, now, MARATHON.gameId, leader.playerId, amountMl, writeToken));
  }
  statements.push(database.prepare(`
    INSERT INTO mini_game_scores(game_id,player_id,score,achieved_at)
    SELECT ?,?,?,? FROM marathon_state WHERE id=1 AND write_token=?
    ON CONFLICT(game_id,player_id) DO UPDATE SET score=mini_game_scores.score+excluded.score,achieved_at=excluded.achieved_at
  `).bind(MARATHON.gameId, context.member.id, amountMl, now, writeToken));
  statements.push(database.prepare(`
    INSERT INTO marathon_giver_limits(player_id,japan_date,water_count,steal_count)
    SELECT ?,?,1,0 FROM marathon_state WHERE id=1 AND write_token=?
    ON CONFLICT(player_id) DO UPDATE SET
      water_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.water_count+1 ELSE 1 END,
      steal_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.steal_count ELSE 0 END,
      japan_date=excluded.japan_date
  `).bind(context.member.id, japanDate, writeToken));
  statements.push(database.prepare(`
    INSERT INTO mini_game_runs(game_id,player_id,run_id,turn,balance,status,last_request_id,result_json,started_at,updated_at)
    SELECT ?,?,?,revision,?,'finished',?,?,?,? FROM marathon_state WHERE id=1 AND write_token=?
    ON CONFLICT(game_id,player_id) DO UPDATE SET run_id=excluded.run_id,turn=excluded.turn,balance=excluded.balance,
      status='finished',last_request_id=excluded.last_request_id,result_json=excluded.result_json,
      started_at=excluded.started_at,updated_at=excluded.updated_at
  `).bind(MARATHON.gameId, context.member.id, request.requestId, amountMl,
    request.requestId, JSON.stringify(receipt), now, now, writeToken));
  const batch = await database.batch(statements);
  const fresh = await readMarathonContext(req);
  if (!fresh) return { status: "unauthorized", context: null };
  if (batch[0].meta.changes === 1) return { status: "accepted", context: fresh };
  if (fresh.lastWater?.requestId === request.requestId) return { status: "duplicate", context: fresh };
  return { status: "conflict", context: fresh };
}

export type MarathonStealResult = {
  status: "accepted" | "duplicate" | "conflict" | "daily-limit" | "insufficient" | "no-target" | "unauthorized";
  context: MarathonContext | null;
};

/** Transfer part of the attacker's cumulative water to a higher-ranked player.
 * Steals update the ranking and revision only; Kobayashi's thirst is untouched. */
export async function stealMarathon(req: Request, context: MarathonContext, request: MarathonStealRequest): Promise<MarathonStealResult> {
  if (context.lastSteal?.requestId === request.requestId) return { status: "duplicate", context };
  if (context.state.revision !== request.expectedRevision) return { status: "conflict", context };
  if (context.dailyStealCount >= MARATHON.dailyStealLimit) return { status: "daily-limit", context };

  const ownIndex = context.scores.findIndex((score) => score.playerId === context.member.id);
  const ownScore = ownIndex >= 0 ? context.scores[ownIndex]?.score ?? 0 : 0;
  const consumedMl = Math.floor(ownScore * MARATHON.stealFeePercent / 100);
  if (ownScore < MARATHON.stealMinimumScoreMl || consumedMl < 1) return { status: "insufficient", context };

  const targets = getEligibleStealTargets(context.scores, context.member.id, ownIndex);
  if (targets.length === 0) return { status: "no-target", context };
  const target = targets[secureIndex(targets.length)];
  if (!target) return { status: "no-target", context };
  const percent = rollStealPercent();
  const stolenMl = Math.floor(target.score * percent / 100);
  if (stolenMl < 1) return { status: "no-target", context };

  const now = Date.now();
  const japanDate = marathonJapanDate(now);
  const receipt: MarathonSteal = {
    requestId: request.requestId, stolenAt: now, consumedMl, stolenMl, percent,
    targetPlayerId: target.playerId, targetName: target.name,
  };
  const writeToken = random();
  const database = db();
  const batch = await database.batch([
    database.prepare(`
      UPDATE marathon_state SET revision=revision+1,total_water_ml=total_water_ml-?,write_token=?
      WHERE id=1 AND revision=? AND total_water_ml>=?
        AND COALESCE((SELECT CASE WHEN japan_date=? THEN steal_count ELSE 0 END
          FROM marathon_giver_limits WHERE player_id=?),0)<?
        AND COALESCE((SELECT score FROM mini_game_scores WHERE game_id=? AND player_id=?),0)>=?
        AND COALESCE((SELECT score FROM mini_game_scores WHERE game_id=? AND player_id=?),0)>=?
        AND EXISTS (SELECT 1 FROM sessions s JOIN member_devices d ON d.hash=s.device_hash
          JOIN players p ON p.id=d.player_id WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
            AND p.id=? AND p.sort_order IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM marathon_giver_limits WHERE player_id=? AND last_steal_request_id=?)
    `).bind(consumedMl, writeToken, request.expectedRevision, consumedMl,
      japanDate, context.member.id, MARATHON.dailyStealLimit,
      MARATHON.gameId, context.member.id, consumedMl,
      MARATHON.gameId, target.playerId, stolenMl,
      context.sessionHash, now, context.member.id, context.member.id, request.requestId),
    database.prepare(`
      UPDATE mini_game_scores SET score=score-?,achieved_at=?
      WHERE game_id=? AND player_id=? AND score>=?
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(stolenMl, now, MARATHON.gameId, target.playerId, stolenMl, writeToken),
    database.prepare(`
      UPDATE mini_game_scores SET score=score-?+?,achieved_at=?
      WHERE game_id=? AND player_id=? AND score>=?
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(consumedMl, stolenMl, now, MARATHON.gameId, context.member.id, consumedMl, writeToken),
    database.prepare(`
      INSERT INTO marathon_giver_limits(player_id,japan_date,water_count,steal_count,last_steal_request_id,last_steal_result_json)
      SELECT ?,?,0,1,?,? FROM marathon_state WHERE id=1 AND write_token=?
      ON CONFLICT(player_id) DO UPDATE SET
        water_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.water_count ELSE 0 END,
        steal_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.steal_count+1 ELSE 1 END,
        last_steal_request_id=excluded.last_steal_request_id,
        last_steal_result_json=excluded.last_steal_result_json,
        japan_date=excluded.japan_date
    `).bind(context.member.id, japanDate, request.requestId, JSON.stringify(receipt), writeToken),
    database.prepare(`
      INSERT INTO marathon_giver_limits(player_id,japan_date,water_count,steal_count,
        pending_steal_count,pending_steal_ml,pending_steal_last_giver_name,pending_steal_version)
      SELECT ?,?,0,0,1,?,?,1 FROM marathon_state WHERE id=1 AND write_token=?
      ON CONFLICT(player_id) DO UPDATE SET
        water_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.water_count ELSE 0 END,
        steal_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.steal_count ELSE 0 END,
        pending_steal_count=marathon_giver_limits.pending_steal_count+1,
        pending_steal_ml=marathon_giver_limits.pending_steal_ml+excluded.pending_steal_ml,
        pending_steal_last_giver_name=excluded.pending_steal_last_giver_name,
        pending_steal_version=marathon_giver_limits.pending_steal_version+1,
        japan_date=excluded.japan_date
    `).bind(target.playerId, japanDate, stolenMl, context.member.name, writeToken),
  ]);
  const fresh = await readMarathonContext(req);
  if (!fresh) return { status: "unauthorized", context: null };
  if (batch[0].meta.changes === 1) return { status: "accepted", context: fresh };
  if (fresh.lastSteal?.requestId === request.requestId) return { status: "duplicate", context: fresh };
  return { status: "conflict", context: fresh };
}

export async function acknowledgeMarathonStealNotification(
  req: Request,
  context: MarathonContext,
  version: number,
): Promise<{ acknowledged: boolean; context: MarathonContext | null }> {
  const now = Date.now();
  const result = await db().prepare(`
    UPDATE marathon_giver_limits
    SET pending_steal_count=0,pending_steal_ml=0,pending_steal_last_giver_name=NULL
    WHERE player_id=? AND pending_steal_version=? AND pending_steal_count>0
      AND EXISTS (SELECT 1 FROM sessions s JOIN member_devices d ON d.hash=s.device_hash
        WHERE s.hash=? AND (s.expires=0 OR s.expires>?) AND d.player_id=?)
  `).bind(context.member.id, version, context.sessionHash, now, context.member.id).run();
  const fresh = await readMarathonContext(req);
  return { acknowledged: (result.meta.changes ?? 0) > 0, context: fresh };
}
