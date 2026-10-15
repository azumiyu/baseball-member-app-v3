// Isolated API regression against Miniflare's actual D1/SQLite runtime.
// No existing application database, credentials, or remote writes are used.
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Miniflare } = require('miniflare');

const root = path.resolve(__dirname, '..');
const mf = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response("isolated royale fixture"); } };',
  compatibilityDate: '2026-05-15',
  d1Databases: ['DB'], d1Persist: false,
});
const cache = new Map();
const queries = [];
let DB;
function load(relative) {
  let file = path.resolve(root, relative);
  if (!path.extname(file)) file += '.ts';
  if (cache.has(file)) return cache.get(file).exports;
  const tsModule = { exports: {} };
  cache.set(file, tsModule);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const localRequire = id => id === 'cloudflare:workers' ? { env: { DB } }
    : id.startsWith('@/') ? load(id.slice(2))
    : id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id);
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: file })(localRequire, tsModule, tsModule.exports);
  return tsModule.exports;
}
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
async function payload(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}
const realNow = Date.now;

(async () => {
  const actualDB = await mf.getD1Database('DB');
  for (const file of fs.readdirSync(path.join(root, 'drizzle')).filter(file => /^\d{4}_.*\.sql$/.test(file)).sort()) {
    const sql = fs.readFileSync(path.join(root, 'drizzle', file), 'utf8');
    await actualDB.batch(sql.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean).map(sql => actualDB.prepare(sql)));
  }
  const instrument = (statement, sql, values = []) => ({
    bind(...bindings) { return instrument(statement.bind(...bindings), sql, bindings); },
    async first(...args) { queries.push({ sql, values }); return statement.first(...args); },
    actual: statement, sql, values,
  });
  DB = {
    prepare: sql => instrument(actualDB.prepare(sql), sql),
    async batch(items) {
      queries.push(...items.map(({ sql, values }) => ({ sql, values })));
      return actualDB.batch(items.map(item => item.actual));
    },
  };
  const server = load('lib/server.ts');
  const rules = load('lib/games/yg-royale.ts');
  const store = load('lib/games/store.ts');
  const route = load('app/api/games/route.ts');
  const catalog = load('lib/games/catalog.ts');
  const gameId = rules.ROYALE.gameId;
  const execute = (sql, ...values) => actualDB.prepare(sql).bind(...values).run();
  const stored = member => actualDB.prepare('SELECT * FROM mini_game_runs WHERE game_id=? AND player_id=?').bind(gameId, playerIds[member]).first();
  const best = member => actualDB.prepare('SELECT score FROM mini_game_scores WHERE game_id=? AND player_id=?').bind(gameId, playerIds[member]).first('score');
  const tokens = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
  const playerIds = [1, 2, 3].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  const hashes = await Promise.all(tokens.map(value => server.digest(value)));
  for (let index = 0; index < playerIds.length; index++) {
    await execute('INSERT INTO players(id,name,number,kana,sort_order) VALUES(?,?,?,?,?)', playerIds[index], `Player ${index + 1}`, String(index + 1), '', index);
    await execute('INSERT INTO member_devices(hash,player_id) VALUES(?,?)', `fixture-${index}`, playerIds[index]);
    await execute('INSERT INTO sessions(hash,device_hash,expires) VALUES(?,?,0)', hashes[index], `fixture-${index}`);
  }
  let now = 1_800_000_000_000;
  Date.now = () => now;
  const request = (body, member = 0, origin = 'http://localhost') => new Request(`http://localhost/api/games?game=${gameId}`, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: origin, Cookie: `team_session=${tokens[member]}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const get = (member = 0) => route.GET(request(undefined, member)).then(response => payload(response));
  const post = (body, status = 200, member = 0) => route.POST(request(body, member)).then(response => payload(response, status));
  const start = (snapshot, id, deck) => ({ action: 'start', gameId, requestId: id,
    runId: snapshot?.run?.id ?? null, turn: snapshot?.run?.turn ?? 0, ...(deck ? { deck } : {}) });
  const step = (snapshot, id, toTick, inputs = []) => ({ action: 'royale-step', gameId,
    requestId: id, runId: snapshot.run.id, turn: snapshot.run.turn, toTick, inputs });

  let initial;
  await check('catalog and authenticated GET expose new game in one SELECT with no writes', async () => {
    assert.equal(catalog.getGame(gameId).href, '/game/yg-clash-royale');
    assert.equal(gameId, 'yg-clash-royale-defense');
    assert.equal(catalog.getGame(gameId).version, 2);
    assert.equal(catalog.getGame(gameId).scoreUnit, 'pt');
    // Old tower-damage records remain untouched and cannot enter this ranking.
    await execute('INSERT INTO mini_game_scores(game_id,player_id,score,achieved_at) VALUES(?,?,?,?)', 'yg-clash-royale', playerIds[0], 99999999, now - 1);
    assert.equal(catalog.getGame('yg-clash-royale'), undefined);
    await payload(await route.GET(new Request('http://localhost/api/games?game=yg-clash-royale')), 404);
    await payload(await route.GET(new Request(`http://localhost/api/games?game=${gameId}`)), 401);
    await payload(await route.GET(new Request('http://localhost/api/games?game=unknown')), 404);
    const count = queries.length;
    initial = await get();
    assert.equal(queries.length - count, 1);
    assert.equal(initial.run, null);
    assert.deepEqual(initial.leaderboard, []);
    assert.equal(await stored(0), null);
  });
  await check('cross-origin, wrong action, malformed deck and malformed input reject before writes', async () => {
    const before = queries.length;
    await payload(await route.POST(request(start(initial, 'bad-origin'), 0, 'https://other.example')), 403);
    await post({ ...start(initial, 'bad-action'), action: 'royale-turn' }, 400);
    for (const deck of [[], ['mega-chiaki'], Array(8).fill('mega-chiaki'), Array(8).fill('unknown'), 'bad']) {
      await post({ ...start(initial, 'bad-deck'), deck }, 400);
    }
    await post({ action: 'royale-step', gameId, requestId: 'bad-input', runId: 'none', turn: 0, toTick: 1,
      inputs: [{ tick: 1, slot: 0, x: -1, y: 650 }] }, 400);
    assert.equal(queries.length, before);
    assert.equal(await stored(0), null);
  });
  let current;
  await check('start generates authoritative seed and default eight-card deck; retry does not reset it', async () => {
    current = await post({ ...start(initial, 'royale-first'), score: 999999999, rng: 123 });
    assert.equal(current.run.gameId, gameId);
    assert.equal(current.run.balance, 0);
    assert.equal(current.run.turn, 0);
    assert.equal(current.run.lastResult.kind, 'yg-royale');
    assert.equal(current.run.lastResult.version, 2);
    assert.equal(current.run.lastResult.preparedAt, now);
    assert.equal(current.run.lastResult.deck.length, 8);
    assert.equal(new Set(current.run.lastResult.deck).size, 8);
    assert.equal(await best(0), null);
    const before = await stored(0);
    const count = queries.length;
    const retry = await post(start(initial, 'royale-first'));
    assert.deepEqual(retry.run, current.run);
    assert.equal(queries.length - count, 1);
    assert.deepEqual(await stored(0), before);
  });
  await check('GET returns exact resumable state without a simulation tick or write', async () => {
    const before = await stored(0);
    assert.deepEqual((await get()).run, current.run);
    assert.deepEqual(await stored(0), before);
  });
  await check('D1 JSON read preserves every saved floating-point bit without a false client divergence', async () => {
    const state = structuredClone(current.run.lastResult);
    state.elixir = 7.123456789012345;
    state.units = [{ id: 41, cardId: 'kitazawa-archer', side: 'player', x: 165.12345678901235, y: 650.9876543210987,
      hp: 370, maxHp: 370, cooldown: 999, spawnTick: 0, hitUntil: 0, attackUntil: 0,
      slowUntil: 0, walkTicks: 0, shield: 0, hitCount: 0, damageScale: 1 }];
    state.nextId = 42;
    await execute('UPDATE mini_game_runs SET result_json=? WHERE game_id=? AND player_id=?', JSON.stringify(state), gameId, playerIds[0]);
    const count = queries.length;
    current = await get();
    assert.equal(queries.length - count, 1);
    assert.deepEqual(current.run.lastResult, state);
    assert.equal(JSON.stringify(current.run.lastResult), JSON.stringify(state));
  });
  await check('future wall-clock tick is rejected without saving', async () => {
    const before = await stored(0);
    const count = queries.length;
    await post(step(current, 'too-early', 200), 400);
    assert.equal(queries.length - count, 1);
    assert.deepEqual(await stored(0), before);
  });
  await check('one ten-second checkpoint replays inputs; claimed score and unit state are ignored', async () => {
    now += 10_000;
    const inputs = [{ tick: 1, slot: 0, x: 165, y: 650 }];
    const expected = rules.advanceRoyale(current.run.lastResult, inputs, 200);
    const count = queries.length;
    current = await post({ ...step(current, 'checkpoint-one', 200, inputs), score: 999999999,
      playerHp: 999999999, units: [{ side: 'player', damage: 999999999 }] });
    assert.deepEqual(current.run.lastResult, expected);
    assert.equal(current.run.balance, expected.score);
    assert.equal(current.run.turn, 1);
    assert.equal(queries.length - count, 2); // one auth SELECT, one atomic state UPDATE
    assert.equal(await best(0), null); // unfinished checkpoints do not write scores
  });
  await check('latest identical request retry returns saved result with one SELECT', async () => {
    const before = await stored(0);
    const count = queries.length;
    const retry = await post({ action: 'royale-step', gameId, requestId: 'checkpoint-one', runId: current.run.id,
      turn: 0, toTick: 200, inputs: [{ tick: 1, slot: 0, x: 165, y: 650 }] });
    assert.deepEqual(retry.run, current.run);
    assert.equal(queries.length - count, 1);
    assert.deepEqual(await stored(0), before);
  });
  await check('too-large, old and out-of-window simulation chunks cannot mutate state', async () => {
    now += 50_000;
    const before = await stored(0);
    await post(step(current, 'chunk-too-large', 401), 400);
    await post(step(current, 'tick-backwards', 199), 400);
    await post(step(current, 'input-before-chunk', 201, [{ tick: 200, slot: 0, x: 165, y: 650 }]), 400);
    await post(step(current, 'input-after-chunk', 201, [{ tick: 202, slot: 0, x: 165, y: 650 }]), 400);
    assert.deepEqual(await stored(0), before);
  });
  await check('bad deployment or excessive input history never reaches D1 update', async () => {
    const before = await stored(0);
    const count = queries.length;
    for (const inputs of [
      [{ tick: 201, slot: 4, x: 165, y: 650 }],
      [{ tick: 201, slot: 0, x: 165, y: 100 }],
      [{ tick: 201.5, slot: 0, x: 165, y: 650 }],
      [{ tick: 201, slot: 0, x: 165, y: NaN }],
      Array.from({ length: 201 }, (_, i) => ({ tick: 201 + i, slot: 0, x: 165, y: 650 })),
    ]) await post(step(current, 'bad-history', 400, inputs), 400);
    assert.equal(queries.slice(count).some(item => /UPDATE mini_game_runs/.test(item.sql)), false);
    assert.deepEqual(await stored(0), before);
  });
  await check('parallel stale contexts can commit only one checkpoint', async () => {
    const contexts = await Promise.all([store.readGameContext(request(), gameId), store.readGameContext(request(), gameId)]);
    const inputs = [step(current, 'parallel-a', 400), step(current, 'parallel-b', 400)];
    const results = await Promise.all(contexts.map((context, i) => store.playGame(context, store.parseGameRequest(inputs[i]))));
    assert.equal(results.filter(Boolean).length, 1);
    current = await get();
    assert.equal(current.run.turn, 2);
    assert.equal(current.run.lastResult.tick, 400);
  });
  await check('overwritten old receipt returns conflict without rolling back state', async () => {
    const before = await stored(0);
    await post({ action: 'royale-step', gameId, requestId: 'checkpoint-one', runId: current.run.id, turn: 0, toTick: 200, inputs: [] }, 409);
    assert.deepEqual(await stored(0), before);
  });
  await check('same-turn duplicate requests race safely with one successful state update', async () => {
    const context = await store.readGameContext(request(), gameId);
    const input = store.parseGameRequest(step(current, 'parallel-identical', 600));
    const results = await Promise.all([store.playGame(context, input), store.playGame(context, input)]);
    assert.equal(results.filter(Boolean).length, 1);
    current = await get();
    assert.equal(current.run.turn, 3);
    assert.equal(current.run.lastResult.tick, 600);
  });
  await check('custom eight-card deck is persisted while other game start requests stay compatible', async () => {
    const deck = [...current.run.lastResult.deck].reverse();
    const another = await post(start(null, 'custom-deck', deck), 200, 1);
    assert.deepEqual(another.run.lastResult.deck, deck);
    const other = { action: 'start', gameId: 'kawataka-chinchiro', requestId: 'chinchiro-compatible', runId: null, turn: 0 };
    const response = await post(other, 200, 1);
    assert.equal(response.run.gameId, 'kawataka-chinchiro');
    assert.equal(response.run.lastResult, null);
    assert.ok(response.run.balance > 0);
  });
  await check('session revoked after read cannot pass the atomic save authentication guard', async () => {
    const context = await store.readGameContext(request(), gameId);
    const before = await stored(0);
    await execute('UPDATE sessions SET expires=? WHERE hash=?', now - 1, hashes[0]);
    const result = await store.playGame(context, store.parseGameRequest(step(current, 'revoked-after-read', 800)));
    assert.equal(result, null);
    assert.deepEqual(await stored(0), before);
    await payload(await route.GET(request()), 401);
    await execute('UPDATE sessions SET expires=0 WHERE hash=?', hashes[0]);
  });
  await check('retired member cannot save even when a cached context existed', async () => {
    const context = await store.readGameContext(request(), gameId);
    const before = await stored(0);
    await execute('UPDATE players SET sort_order=NULL WHERE id=?', playerIds[0]);
    assert.equal(await store.playGame(context, store.parseGameRequest(step(current, 'retired-after-read', 800))), null);
    assert.deepEqual(await stored(0), before);
    await payload(await route.GET(request()), 401);
    await execute('UPDATE players SET sort_order=0 WHERE id=?', playerIds[0]);
  });

  const finishFixture = async (member, score, id) => {
    const snapshot = await get(member);
    const started = await post(start(snapshot, id), 200, member);
    const state = structuredClone(started.run.lastResult);
    // The last enemy is killed by the self-tower on the same tick it lands a
    // lethal strike: its bounty must join the score before the record is saved.
    state.score = score - 210;
    state.playerHp = 1;
    state.towerCooldown = 0;
    state.units = [{ id: 1, cardId: 'ramen-negishi', side: 'enemy', x: 300, y: 770,
      hp: 1, maxHp: 1100, cooldown: 0, spawnTick: 0, hitUntil: 0, attackUntil: 0,
      slowUntil: 0, walkTicks: 0, shield: 0, hitCount: 0, damageScale: 1 }];
    state.nextId = 2;
    await execute('UPDATE mini_game_runs SET result_json=? WHERE game_id=? AND player_id=?', JSON.stringify(state), gameId, playerIds[member]);
    now += 50;
    const saved = await get(member);
    const expected = rules.advanceRoyale(state, [], 1);
    assert.equal(expected.status, 'finished');
    assert.equal(expected.kills, 1);
    assert.equal(expected.score, score);
    return { before: saved, body: step(saved, `${id}-finish`, 1), expected };
  };
  let finish;
  let finished;
  await check('terminal server simulation atomically saves last-tick kill points and personal best', async () => {
    finish = await finishFixture(0, 1234, 'terminal-a');
    const count = queries.length;
    finished = await post({ ...finish.body, score: 999999999 });
    assert.deepEqual(finished.run.lastResult, finish.expected);
    assert.equal(finished.run.status, 'finished');
    assert.equal(finished.run.balance, 1234);
    assert.equal(finished.personalBest.score, 1234);
    assert.equal(queries.length - count, 3); // read, run update, best-score upsert
    assert.equal(await best(0), 1234);
  });
  await check('terminal retry cannot publish another score or change achieved timestamp', async () => {
    const before = await stored(0);
    const count = queries.length;
    assert.deepEqual((await post(finish.body)).personalBest, finished.personalBest);
    assert.equal(queries.length - count, 1);
    assert.deepEqual(await stored(0), before);
  });
  await check('finished runs cannot accept a new step or change their final record', async () => {
    const before = await stored(0);
    await post(step(finished, 'after-terminal', finished.run.lastResult.tick + 1), 409);
    assert.deepEqual(await stored(0), before);
    assert.equal(await best(0), 1234);
  });
  await check('lower score preserves personal best and one row per player', async () => {
    const low = await finishFixture(0, 900, 'terminal-low');
    const result = await post(low.body);
    assert.equal(result.run.balance, 900);
    assert.equal(result.personalBest.score, 1234);
    assert.equal(await actualDB.prepare('SELECT count(*) AS n FROM mini_game_runs WHERE game_id=? AND player_id=?').bind(gameId, playerIds[0]).first('n'), 1);
    assert.equal(await actualDB.prepare('SELECT count(*) AS n FROM mini_game_scores WHERE game_id=? AND player_id=?').bind(gameId, playerIds[0]).first('n'), 1);
  });
  await check('highest kill points rank first; equal scores retain earlier achievement and old damage stays separate', async () => {
    const stronger = await finishFixture(1, 2000, 'terminal-b');
    await post(stronger.body, 200, 1);
    const equal = await finishFixture(2, 2000, 'terminal-c');
    const result = await post(equal.body, 200, 2);
    assert.deepEqual(result.leaderboard.map(entry => [entry.playerId, entry.score]), [[playerIds[1], 2000], [playerIds[2], 2000], [playerIds[0], 1234]]);
    assert.equal(result.personalBest.rank, 2);
    assert.equal(await actualDB.prepare('SELECT score FROM mini_game_scores WHERE game_id=? AND player_id=?').bind('yg-clash-royale', playerIds[0]).first('score'), 99999999);
    await execute('UPDATE players SET sort_order=NULL WHERE id=?', playerIds[1]);
    assert.deepEqual((await get()).leaderboard.map(entry => entry.playerId), [playerIds[2], playerIds[0]]);
  });
  console.log(`\n${checks} YG royale API/D1 checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  Date.now = realNow;
  await mf.dispose();
});
