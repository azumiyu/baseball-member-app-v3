import type { AuthMember } from "../auth-types";
import { db, digest, random, token, validToken } from "../server";
import type { LeaderboardEntry } from "./api-types";
import { MARATHON, marathonAvailableWaterMl, marathonMood, marathonWaitMs,
  type MarathonSnapshot, type MarathonState, type MarathonWater, type MarathonWaterRequest } from "./marathon";

type Score = Omit<LeaderboardEntry, "rank">;
type ContextRow = {
  id: string; name: string; number: string; is_admin: number; can_edit_lineup: number;
  started_at: number; last_watered_at: number; revision: number; total_water_ml: number;
  last_giver_name: string | null; receipt_json: string | null; scores_json: string;
};
export type MarathonContext = {
  member: AuthMember; sessionHash: string; state: MarathonState;
  scores: Score[]; lastWater: MarathonWater | null;
};

// One indexed query authenticates and returns the shared timestamps, ranking,
// and this member's last receipt. It never updates distance or thirst in D1.
export async function readMarathonContext(req: Request): Promise<MarathonContext | null> {
  const value = token(req);
  if (!validToken(value)) return null;
  const sessionHash = await digest(value);
  const row = await db().prepare(`
    SELECT p.id,p.name,p.number,p.is_admin,p.can_edit_lineup,
      m.started_at,m.last_watered_at,m.revision,m.total_water_ml,m.last_giver_name,
      (SELECT r.result_json FROM mini_game_runs r WHERE r.game_id=? AND r.player_id=p.id) AS receipt_json,
      (SELECT json_group_array(json_object('playerId',scores.player_id,'name',scores.name,
        'number',scores.number,'score',scores.score,'achievedAt',scores.achieved_at))
       FROM (SELECT s.player_id,s.score,s.achieved_at,players.name,players.number
         FROM mini_game_scores s JOIN players ON players.id=s.player_id AND players.sort_order IS NOT NULL
         WHERE s.game_id=? ORDER BY s.score DESC,s.achieved_at,s.player_id) scores) AS scores_json
    FROM sessions session JOIN member_devices device ON device.hash=session.device_hash
    JOIN players p ON p.id=device.player_id AND p.sort_order IS NOT NULL
    JOIN marathon_state m ON m.id=1
    WHERE session.hash=? AND (session.expires=0 OR session.expires>?)
  `).bind(MARATHON.gameId, MARATHON.gameId, sessionHash, Date.now()).first<ContextRow>();
  if (!row) return null;
  return {
    member: { id: row.id, name: row.name, number: row.number,
      isAdmin: row.is_admin === 1, canEditLineup: row.can_edit_lineup === 1 },
    sessionHash,
    state: { startedAt: row.started_at, lastWateredAt: row.last_watered_at, revision: row.revision,
      totalWaterMl: row.total_water_ml, lastGiverName: row.last_giver_name },
    scores: JSON.parse(row.scores_json) as Score[],
    lastWater: row.receipt_json ? JSON.parse(row.receipt_json) as MarathonWater : null,
  };
}

export function marathonSnapshot(context: MarathonContext, serverNow = Date.now()): MarathonSnapshot {
  const ranked = context.scores.map((score, index) => ({ ...score, rank: index + 1 }));
  return { member: context.member, gameId: MARATHON.gameId, run: null, serverNow,
    state: context.state, lastWater: context.lastWater, leaderboard: ranked.slice(0, 10),
    personalBest: ranked.find((score) => score.playerId === context.member.id) ?? null };
}

export function parseMarathonRequest(value: unknown): MarathonWaterRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { requestId, expectedRevision } = value as Record<string, unknown>;
  return typeof requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
    && Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0
    ? { requestId, expectedRevision: expectedRevision as number } : null;
}

export type MarathonWaterResult = { status: "accepted" | "duplicate" | "conflict" | "waiting" | "unauthorized"; context: MarathonContext | null };

/** D1 serializes the transactional batch. Exactly one CAS can consume the
 * shared thirst; a new server token guards both credit and receipt writes.
 * Duplicate in-flight requests can therefore never add the same water twice. */
export async function waterMarathon(req: Request, context: MarathonContext, request: MarathonWaterRequest): Promise<MarathonWaterResult> {
  if (context.lastWater?.requestId === request.requestId) return { status: "duplicate", context };
  if (context.state.revision !== request.expectedRevision) return { status: "conflict", context };
  const now = Date.now();
  if (marathonWaitMs(context.state, now) > 0) return { status: "waiting", context };
  const amountMl = marathonAvailableWaterMl(context.state, now);
  const mood = marathonMood(context.state, now);
  const receipt: MarathonWater = { requestId: request.requestId, amountMl, wateredAt: now, mood: mood.kind, multiplier: mood.multiplier };
  const writeToken = random();
  const database = db();
  const batch = await database.batch([
    database.prepare(`
      UPDATE marathon_state SET last_watered_at=?,revision=revision+1,total_water_ml=total_water_ml+?,
        last_giver_name=?,write_token=?
      WHERE id=1 AND revision=? AND last_watered_at<=?
        AND EXISTS (SELECT 1 FROM sessions s JOIN member_devices d ON d.hash=s.device_hash
          JOIN players p ON p.id=d.player_id WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
            AND p.id=? AND p.sort_order IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM mini_game_runs WHERE game_id=? AND player_id=? AND last_request_id=?)
    `).bind(now, amountMl, context.member.name, writeToken, request.expectedRevision, now - MARATHON.minWaterIntervalMs,
      context.sessionHash, now, context.member.id, MARATHON.gameId, context.member.id, request.requestId),
    database.prepare(`
      INSERT INTO mini_game_scores(game_id,player_id,score,achieved_at)
      SELECT ?,?,?,? FROM marathon_state WHERE id=1 AND write_token=?
      ON CONFLICT(game_id,player_id) DO UPDATE SET score=mini_game_scores.score+excluded.score,achieved_at=excluded.achieved_at
    `).bind(MARATHON.gameId, context.member.id, amountMl, now, writeToken),
    database.prepare(`
      INSERT INTO mini_game_runs(game_id,player_id,run_id,turn,balance,status,last_request_id,result_json,started_at,updated_at)
      SELECT ?,?,?,revision,?,'finished',?,?,?,? FROM marathon_state WHERE id=1 AND write_token=?
      ON CONFLICT(game_id,player_id) DO UPDATE SET run_id=excluded.run_id,turn=excluded.turn,balance=excluded.balance,
        status='finished',last_request_id=excluded.last_request_id,result_json=excluded.result_json,
        started_at=excluded.started_at,updated_at=excluded.updated_at
    `).bind(MARATHON.gameId, context.member.id, request.requestId, amountMl, request.requestId, JSON.stringify(receipt), now, now, writeToken),
  ]);
  const fresh = await readMarathonContext(req);
  if (!fresh) return { status: "unauthorized", context: null };
  if (batch[0].meta.changes === 1) return { status: "accepted", context: fresh };
  if (fresh.lastWater?.requestId === request.requestId) return { status: "duplicate", context: fresh };
  return { status: "conflict", context: fresh };
}
