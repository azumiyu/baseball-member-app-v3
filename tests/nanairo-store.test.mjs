import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Run the actual store SQL against isolated in-memory SQLite, supplying only
// the Cloudflare binding and cookie hashing boundary. Never touch local D1 data.
const project = fileURLToPath(new URL("../", import.meta.url));
const cache = new Map();
const server = `export const db = () => globalThis.__nanairoTestDatabase;
export const token = req => req.headers.get('cookie') === 'fixture=valid' ? 'fixture-session' : '';
export const validToken = value => value === 'fixture-session';
export const digest = async value => value;`;
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
async function moduleUrl(filename) {
  if (filename === resolve(project, "lib/server.ts")) return dataUrl(server);
  if (cache.has(filename)) return cache.get(filename);
  const source = await readFile(filename, "utf8");
  let code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const match of [...code.matchAll(/from\s+["'](\.[^"']+)["']/g)]) {
    let dependency = resolve(dirname(filename), match[1]);
    if (!extname(dependency)) dependency += ".ts";
    const url = await moduleUrl(dependency);
    code = code.replaceAll(`"${match[1]}"`, `"${url}"`).replaceAll(`'${match[1]}'`, `'${url}'`);
  }
  const url = dataUrl(code);
  cache.set(filename, url);
  return url;
}
const { parseGameRequest, playGame, readGameContext, GameInputError } = await import(await moduleUrl(resolve(project, "lib/games/store.ts")));
const migration = await readFile(resolve(project, "drizzle/0010_mini_games.sql"), "utf8");
const gameId = "goto-nanairo";
const req = new Request("http://localhost/api/games", { headers: { cookie: "fixture=valid" } });
let fixtures = 0;
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE players(id TEXT PRIMARY KEY,name TEXT,number TEXT,is_admin INTEGER,can_edit_lineup INTEGER,sort_order INTEGER);
    CREATE TABLE member_devices(hash TEXT PRIMARY KEY,player_id TEXT);
    CREATE TABLE sessions(hash TEXT PRIMARY KEY,device_hash TEXT,expires INTEGER);
    INSERT INTO players VALUES('member-1','テスト選手','99',0,0,0);
    INSERT INTO member_devices VALUES('fixture-device','member-1');
    INSERT INTO sessions VALUES('fixture-session','fixture-device',0);`);
  sqlite.exec(migration);
  globalThis.__nanairoTestDatabase = {
    prepare(sql) {
      return { sql, values: [], bind(...values) { this.values = values; return this; },
        async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; } };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(statement => {
          const prepared = sqlite.prepare(statement.sql);
          return { results: /\bRETURNING\b/i.test(statement.sql) ? prepared.all(...statement.values) : (prepared.run(...statement.values), []) };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  fixtures++;
  return sqlite;
}
async function start() {
  const context = await readGameContext(req, gameId);
  return playGame(context, parseGameRequest({ gameId, action: "start", requestId: `run-${fixtures}`,
    runId: context.run?.id ?? null, turn: context.run?.turn ?? 0 }));
}
function pitchRequest(snapshot, requestId) {
  return parseGameRequest({ gameId, action: "nanairo-pitch", requestId, runId: snapshot.run.id, turn: snapshot.run.turn,
    target: { x: 30, y: 85 }, elapsedMs: snapshot.run.lastResult.ready.releaseMs, score: 999999999 });
}

test("API parser validates game/action, aim and time and drops claimed scores", () => {
  const base = { gameId, action: "nanairo-pitch", requestId: "pitch-1", runId: "run-1", turn: 0, target: { x: 50, y: 50 }, elapsedMs: 1900 };
  assert.equal("score" in parseGameRequest({ ...base, score: 999999999 }), false);
  for (const patch of [{ target: null }, { elapsedMs: Infinity }, { elapsedMs: 4001 }, { target: { x: 101, y: 50 } },
    { turn: -1 }, { runId: null }, { gameId: "oshino-fastball" }, { action: "pitch" }, { gameId: "unknown" }]) {
    assert.throws(() => parseGameRequest({ ...base, ...patch }), GameInputError);
  }
});

test("actual SQL saves five turns, resumes, records only the final score, and deduplicates retries", async () => {
  const sqlite = setup();
  try {
    assert.equal(await readGameContext(new Request(req.url), gameId), null);
    let snapshot = await start();
    const replayStart = await playGame(await readGameContext(req, gameId), parseGameRequest({ gameId, action: "start", requestId: snapshot.run.id, runId: null, turn: 0 }));
    assert.deepEqual(replayStart, snapshot);
    for (let turn = 0; turn < 5; turn++) {
      const action = pitchRequest(snapshot, `pitch-${turn}`);
      const oldContext = await readGameContext(req, gameId);
      snapshot = await playGame(oldContext, action);
      assert.equal(snapshot.run.turn, turn + 1);
      assert.equal(snapshot.run.lastResult.history.length, turn + 1);
      assert.equal(snapshot.run.status, turn === 4 ? "finished" : "playing");
      assert.equal(sqlite.prepare("SELECT count(*) AS n FROM mini_game_scores").get().n, turn === 4 ? 1 : 0);
      const restored = await readGameContext(req, gameId);
      assert.deepEqual(restored.run, snapshot.run);
      assert.deepEqual((await playGame(restored, action)).run, snapshot.run);
      assert.equal(await playGame(oldContext, { ...action, requestId: `stale-${turn}` }), null);
    }
    const total = snapshot.run.lastResult.history.reduce((sum, pitch) => sum + pitch.points, 0);
    assert.equal(snapshot.run.balance, Math.max(0, total));
    assert.equal(snapshot.personalBest.score, Math.max(0, total));
    assert.equal(snapshot.leaderboard[0].playerId, "member-1");
    assert.equal(snapshot.leaderboard[0].name, "テスト選手");
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM mini_game_runs").get().n, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM mini_game_scores WHERE game_id!='goto-nanairo'").get().n, 0);
  } finally { sqlite.close(); }
});

test("a lower final score preserves the existing best and achievement time", async () => {
  const sqlite = setup();
  try {
    sqlite.exec("INSERT INTO mini_game_scores VALUES('goto-nanairo','member-1',50000,123)");
    let snapshot = await start();
    for (let turn = 0; turn < 5; turn++) snapshot = await playGame(await readGameContext(req, gameId), pitchRequest(snapshot, `lower-${turn}`));
    assert.equal(snapshot.personalBest.score, 50000);
    assert.equal(snapshot.personalBest.achievedAt, 123);
    assert.equal(sqlite.prepare("SELECT score FROM mini_game_scores").get().score, 50000);
    sqlite.exec("UPDATE sessions SET expires=1");
    assert.equal(await readGameContext(req, gameId), null);
  } finally { sqlite.close(); }
});
