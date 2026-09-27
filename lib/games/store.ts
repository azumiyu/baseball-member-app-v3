import type { AuthMember } from "../auth-types";
import { db, digest, token, validToken } from "../server";
import type { GameRequest, GameRun, GameSnapshot, LeaderboardEntry, GameResult } from "./api-types";
import { gameEngine } from "./registry";
import { MAX_ELAPSED_MS } from "./fastball";

type Score = Omit<LeaderboardEntry, "rank">;
type GameContext = { member: AuthMember; sessionHash: string; run: GameRun<GameResult> | null; scores: Score[] };
type ContextRow = {
  id: string; name: string; number: string; is_admin: number; can_edit_lineup: number;
  run_json: string | null; scores_json: string;
};

export class GameInputError extends Error {}

// A single SELECT authenticates the member and reads their resumable run and
// indexed best scores. Only active roster members appear in the ranking.
export async function readGameContext(req: Request, gameId: string): Promise<GameContext | null> {
  const value = token(req);
  if (!validToken(value)) return null;
  const sessionHash = await digest(value);
  const row = await db().prepare(`
    SELECT p.id,p.name,p.number,p.is_admin,p.can_edit_lineup,
      (SELECT json_object('id',r.run_id,'gameId',r.game_id,'turn',r.turn,'balance',r.balance,
        'status',r.status,'lastRequestId',r.last_request_id,'lastResult',json(r.result_json))
       FROM mini_game_runs r WHERE r.game_id=? AND r.player_id=p.id) AS run_json,
      (SELECT json_group_array(json_object('playerId',scores.player_id,'name',scores.name,
        'number',scores.number,'score',scores.score,'achievedAt',scores.achieved_at))
       FROM (SELECT s.player_id,s.score,s.achieved_at,players.name,players.number
         FROM mini_game_scores s JOIN players ON players.id=s.player_id AND players.sort_order IS NOT NULL
         WHERE s.game_id=? ORDER BY s.score DESC,s.achieved_at,s.player_id) scores) AS scores_json
    FROM sessions session JOIN member_devices device ON device.hash=session.device_hash
    JOIN players p ON p.id=device.player_id AND p.sort_order IS NOT NULL
    WHERE session.hash=? AND (session.expires=0 OR session.expires>?)
  `).bind(gameId, gameId, sessionHash, Date.now()).first<ContextRow>();
  if (!row) return null;
  return {
    member: { id: row.id, name: row.name, number: row.number, isAdmin: row.is_admin === 1, canEditLineup: row.can_edit_lineup === 1 },
    sessionHash, run: row.run_json ? JSON.parse(row.run_json) as GameRun<GameResult> : null,
    scores: JSON.parse(row.scores_json) as Score[],
  };
}

export function gameSnapshot(context: GameContext, gameId: string): GameSnapshot<GameResult> {
  const scores = [...context.scores].sort((a, b) => b.score - a.score || a.achievedAt - b.achievedAt || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  const ranked = scores.map((score, index) => ({ ...score, rank: index + 1 }));
  return { member: context.member, gameId, run: context.run, leaderboard: ranked.slice(0, 10), personalBest: ranked.find((score) => score.playerId === context.member.id) ?? null };
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

export function parseGameRequest(value: unknown): GameRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GameInputError("ゲームの操作を確認してください。");
  const body = value as Record<string, unknown>;
  if (typeof body.gameId !== "string" || !gameEngine(body.gameId) || !isId(body.requestId)
    || (body.runId !== null && !isId(body.runId)) || !Number.isSafeInteger(body.turn) || (body.turn as number) < 0) {
    throw new GameInputError("ゲームの操作を確認してください。");
  }
  if (body.action === "start") return { action: "start", gameId: body.gameId, requestId: body.requestId, runId: body.runId as string | null, turn: body.turn as number };
  const engine = gameEngine(body.gameId)!;
  if (body.action === "turn" && engine.kind === "chinchiro" && isId(body.runId) && Number.isSafeInteger(body.bet) && (body.bet as number) > 0) {
    return { action: "turn", gameId: body.gameId, requestId: body.requestId, runId: body.runId, turn: body.turn as number, bet: body.bet as number };
  }
  if (body.action === "pitch" && engine.kind === "fastball" && isId(body.runId) && typeof body.elapsedMs === "number"
    && Number.isFinite(body.elapsedMs) && body.elapsedMs >= 0 && body.elapsedMs <= MAX_ELAPSED_MS) {
    return { action: "pitch", gameId: body.gameId, requestId: body.requestId, runId: body.runId, turn: body.turn as number, elapsedMs: body.elapsedMs };
  }
  throw new GameInputError("入力内容とゲームの操作を確認してください。");
}

const authGuard = `EXISTS (SELECT 1 FROM sessions s
  JOIN member_devices d ON d.hash=s.device_hash JOIN players p ON p.id=d.player_id
  WHERE s.hash=? AND (s.expires=0 OR s.expires>?) AND p.id=? AND p.sort_order IS NOT NULL)`;

/** Each action resolves one game turn on the server. Animation frames do not
 * write to D1, and duplicate clicks/retries cannot settle the same turn twice.
 */
export async function playGame(context: GameContext, request: GameRequest): Promise<GameSnapshot<GameResult> | null> {
  const engine = gameEngine(request.gameId)!;
  const current = context.run;
  if ((request.action === "start" && current?.id === request.requestId)
    || (request.action !== "start" && current?.id === request.runId && current.lastRequestId === request.requestId)) {
    return gameSnapshot(context, request.gameId);
  }
  if ((current?.id ?? null) !== request.runId || (current?.turn ?? 0) !== request.turn) return null;
  const database = db();
  const now = Date.now();
  const authValues = [context.sessionHash, now, context.member.id];
  const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
  if (request.action === "start") {
    const run: GameRun<GameResult> = { id: request.requestId, gameId: request.gameId, turn: 0, balance: engine.initialBalance, status: "playing", lastRequestId: request.requestId,
      lastResult: engine.kind === "fastball" ? { kind: "fastball-ready", releaseMs: engine.prepare(random) } : null };
    const saved = await database.prepare(`
      INSERT INTO mini_game_runs(game_id,player_id,run_id,turn,balance,status,last_request_id,result_json,started_at,updated_at)
      SELECT ?,?,?,0,?,'playing',?,?,?,? WHERE ${authGuard}
        AND (? IS NULL OR EXISTS (SELECT 1 FROM mini_game_runs WHERE game_id=? AND player_id=? AND run_id=? AND turn=?))
      ON CONFLICT(game_id,player_id) DO UPDATE SET run_id=excluded.run_id,turn=0,balance=excluded.balance,
        status='playing',last_request_id=excluded.last_request_id,result_json=excluded.result_json,started_at=excluded.started_at,updated_at=excluded.updated_at
      WHERE mini_game_runs.run_id=? AND mini_game_runs.turn=? RETURNING run_id
    `).bind(request.gameId, context.member.id, run.id, run.balance, request.requestId, JSON.stringify(run.lastResult), now, now, ...authValues,
      request.runId, request.gameId, context.member.id, request.runId, request.turn, request.runId, request.turn).first<{ run_id: string }>();
    return saved ? gameSnapshot({ ...context, run }, request.gameId) : null;
  }
  if (!current || current.status !== "playing" || current.turn >= engine.maxTurns) return null;
  let run: GameRun<GameResult>;
  if (engine.kind === "chinchiro" && request.action === "turn") {
    if (current.balance <= 0) return null;
    if (request.bet > current.balance) throw new GameInputError("持ち金以内の賭け金を入力してください。");
    const result = engine.play(current.balance, request.bet, random);
    run = { ...current, turn: current.turn + 1, balance: result.balanceAfter, lastRequestId: request.requestId, lastResult: result, status: current.turn + 1 >= engine.maxTurns || result.balanceAfter === 0 ? "finished" : "playing" };
  } else if (engine.kind === "fastball" && request.action === "pitch") {
    const ready = current.lastResult;
    if (!ready || !("kind" in ready) || ready.kind !== "fastball-ready") return null;
    // The browser measures input timing; the server owns the target and formula.
    // Neither the claimed speed nor a client-supplied target is accepted.
    const result = engine.play(request.elapsedMs, ready.releaseMs);
    run = { ...current, turn: current.turn + 1, balance: result.speed, status: "finished", lastResult: result, lastRequestId: request.requestId };
  } else {
    throw new GameInputError("このゲームでは使えない操作です。");
  }
  const statements = [database.prepare(`
    UPDATE mini_game_runs SET turn=?,balance=?,status=?,last_request_id=?,result_json=?,updated_at=?
    WHERE game_id=? AND player_id=? AND run_id=? AND turn=? AND status='playing' AND ${authGuard}
    RETURNING run_id
  `).bind(run.turn, run.balance, run.status, request.requestId, JSON.stringify(run.lastResult), now,
    request.gameId, context.member.id, current.id, current.turn, ...authValues)];
  const best = context.scores.find((score) => score.playerId === context.member.id);
  const improvesBest = run.status === "finished" && (!best || run.balance > best.score);
  if (improvesBest) {
    // Read the committed balance from the run, not the candidate calculation.
    // Even concurrent retries of the same request can only record that result.
    statements.push(database.prepare(`
      INSERT INTO mini_game_scores(game_id,player_id,score,achieved_at)
      SELECT game_id,player_id,balance,updated_at FROM mini_game_runs
      WHERE game_id=? AND player_id=? AND run_id=? AND last_request_id=? AND status='finished'
        AND ${authGuard}
      ON CONFLICT(game_id,player_id) DO UPDATE SET score=excluded.score,achieved_at=excluded.achieved_at
      WHERE excluded.score>mini_game_scores.score
    `).bind(request.gameId, context.member.id, run.id, request.requestId, ...authValues));
  }
  const committed = await database.batch<{ run_id: string }>(statements);
  if (!committed[0].results.length) return null;
  let scores = context.scores;
  if (improvesBest) scores = [...scores.filter((score) => score.playerId !== context.member.id), { playerId: context.member.id, name: context.member.name, number: context.member.number, score: run.balance, achievedAt: now }];
  return gameSnapshot({ ...context, run, scores }, request.gameId);
}
