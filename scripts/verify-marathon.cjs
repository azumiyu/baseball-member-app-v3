// Isolated D1 regression: no application database, credentials or remote writes.
// Miniflare starts workerd, so Windows may require approval for that subprocess.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Miniflare } = require('miniflare');

const root = path.resolve(__dirname, '..');
const mf = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response("isolated marathon fixture"); } };',
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
  const module = { exports: {} };
  cache.set(file, module);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const localRequire = id => id === 'cloudflare:workers' ? { env: { DB } }
    : id.startsWith('@/') ? load(id.slice(2))
    : id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id);
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
const statements = sql => sql.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean);
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
    await actualDB.batch(statements(fs.readFileSync(path.join(root, 'drizzle', file), 'utf8')).map(sql => actualDB.prepare(sql)));
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
  const rules = load('lib/games/marathon.ts');
  const store = load('lib/games/marathon-store.ts');
  const route = load('app/api/games/marathon/route.ts');
  const execute = (sql, ...values) => actualDB.prepare(sql).bind(...values).run();
  const shared = () => actualDB.prepare('SELECT * FROM marathon_state WHERE id=1').first();
  const score = id => actualDB.prepare('SELECT score FROM mini_game_scores WHERE game_id=? AND player_id=?').bind(rules.MARATHON.gameId, id).first('score');
  const tokens = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
  const playerIds = [1, 2, 3].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  const hashes = await Promise.all(tokens.map(value => server.digest(value)));
  for (let index = 0; index < playerIds.length; index++) {
    await execute('INSERT INTO players(id,name,number,kana,sort_order) VALUES(?,?,?,?,?)', playerIds[index], `Player ${index + 1}`, String(index + 1), '', index);
    await execute('INSERT INTO member_devices(hash,player_id) VALUES(?,?)', `fixture-${index}`, playerIds[index]);
    await execute('INSERT INTO sessions(hash,device_hash,expires) VALUES(?,?,0)', hashes[index], `fixture-${index}`);
  }
  const request = (body, member = 0, origin = 'http://localhost') => new Request('http://localhost/api/games/marathon', {
    method: body ? 'POST' : 'GET',
    headers: { Origin: origin, Cookie: `team_session=${tokens[member]}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let now;
  let startedAt;
  await check('migration creates exactly one runner with five minutes initial thirst', async () => {
    const state = await shared();
    assert.equal(state.revision, 0);
    assert.equal(state.total_water_ml, 0);
    assert.equal(state.started_at - state.last_watered_at, 300_000);
    assert.equal(await actualDB.prepare('SELECT count(*) AS n FROM marathon_state').first('n'), 1);
    startedAt = state.started_at;
    now = startedAt + 90_000; // Always a normal mood outside the event minute.
    Date.now = () => now;
  });
  await check('300 meters per minute, offline distance and increasing thirst need no stored ticks', async () => {
    const state = { startedAt, lastWateredAt: startedAt, revision: 0, totalWaterMl: 0, lastGiverName: null };
    assert.equal(rules.marathonDistanceKm(state, startedAt + 60_000), 0.3);
    assert.equal(rules.marathonDistanceKm(state, startedAt + 86_400_000), 432);
    assert.equal(rules.marathonDistanceKm(state, startedAt - 1), 0);
    assert.equal(rules.marathonAvailableWaterMl(state, startedAt + 90_000), 90);
    assert.equal(rules.marathonAvailableWaterMl(state, startedAt + 120_000), 120);
    assert.equal(rules.marathonAvailableWaterMl({ ...state, lastWateredAt: now }, now), 0);
    assert.equal(rules.marathonWaitMs({ lastWateredAt: now }, now), 10_000);
  });
  await check('GET authenticates in one SELECT and never writes or advances stored state', async () => {
    await payload(await route.GET(new Request('http://localhost/api/games/marathon')), 401);
    const before = await shared();
    const count = queries.length;
    const snapshot = await payload(await route.GET(request()));
    assert.equal(queries.length - count, 1);
    assert.equal(snapshot.gameId, rules.MARATHON.gameId);
    assert.equal(snapshot.run, null);
    assert.equal(snapshot.serverNow, now);
    assert.equal(snapshot.member.id, playerIds[0]);
    assert.deepEqual(snapshot.leaderboard, []);
    assert.equal(snapshot.personalBest, null);
    for (let i = 0; i < 5; i++) await payload(await route.GET(request()));
    assert.deepEqual(await shared(), before);
  });
  await check('POST rejects cross-origin, invalid revision and malformed IDs without writes', async () => {
    const before = await shared();
    await payload(await route.POST(request({ requestId: 'cross-origin', expectedRevision: 0 }, 0, 'https://other.example')), 403);
    await payload(await route.POST(request({ requestId: 'invalid', expectedRevision: -1 })), 400);
    await payload(await route.POST(request({ requestId: 'bad id', expectedRevision: 0 })), 400);
    assert.deepEqual(await shared(), before);
  });
  let first;
  await check('water uses server elapsed time and one fixed three-write transaction', async () => {
    await execute('UPDATE marathon_state SET last_watered_at=? WHERE id=1', now - 120_000);
    const count = queries.length;
    first = await payload(await route.POST(request({ requestId: 'water-first', expectedRevision: 0, amountMl: 999999999, serverNow: now + 999999999 })));
    assert.equal(queries.length - count, 5); // Read, three atomic writes, read.
    assert.equal(first.lastWater.amountMl, 120);
    assert.equal(first.state.totalWaterMl, 120);
    assert.equal(first.state.revision, 1);
    assert.equal(first.state.lastWateredAt, now);
    assert.equal(first.state.lastGiverName, 'Player 1');
    assert.equal(first.personalBest.score, 120);
  });
  await check('retry returns its receipt without credit and global ten-second fullness performs no write', async () => {
    const before = await shared();
    const count = queries.length;
    const duplicate = await payload(await route.POST(request({ requestId: 'water-first', expectedRevision: 0 })));
    assert.equal(duplicate.lastWater.amountMl, 120);
    assert.equal(queries.length - count, 1);
    now += 9_999;
    const waiting = await payload(await route.POST(request({ requestId: 'too-soon', expectedRevision: 1 }, 1)), 409);
    assert.equal(waiting.snapshot.state.revision, 1);
    assert.deepEqual(await shared(), before);
    assert.equal(await score(playerIds[1]), null);
  });
  await check('simultaneous different givers share thirst and exactly one receives credit', async () => {
    now += 20_001;
    const contexts = await Promise.all([store.readMarathonContext(request()), store.readMarathonContext(request(undefined, 1))]);
    const inputs = contexts.map((context, index) => ({ requestId: `parallel-${index}`, expectedRevision: context.state.revision }));
    const results = await Promise.all(contexts.map((context, index) => store.waterMarathon(request(inputs[index], index), context, inputs[index])));
    assert.equal(results.filter(result => result.status === 'accepted').length, 1);
    assert.equal(results.filter(result => result.status === 'conflict').length, 1);
    const state = await shared();
    assert.equal(state.revision, 2);
    assert.equal(state.total_water_ml, 150);
    assert.equal((await score(playerIds[0]) ?? 0) + (await score(playerIds[1]) ?? 0), 150);
  });
  await check('simultaneous identical bodies cannot double-credit with a stale receipt context', async () => {
    now += 20_000;
    const context = await store.readMarathonContext(request());
    const input = { requestId: 'parallel-duplicate', expectedRevision: context.state.revision };
    const before = await shared();
    const results = await Promise.all([
      store.waterMarathon(request(input), context, input),
      store.waterMarathon(request(input), context, input),
    ]);
    assert.equal(results.filter(result => result.status === 'accepted').length, 1);
    assert.equal(results.filter(result => result.status === 'duplicate').length, 1);
    assert.equal((await shared()).total_water_ml - before.total_water_ml, 20);
    assert.equal((await shared()).revision - before.revision, 1);
  });
  await check('cumulative scores retain one receipt and an older overwritten retry cannot credit again', async () => {
    now += 20_000;
    const context = await store.readMarathonContext(request());
    const beforeScore = await score(playerIds[0]);
    const latest = await payload(await route.POST(request({ requestId: 'water-later', expectedRevision: context.state.revision })));
    assert.equal(latest.personalBest.score, beforeScore + 20);
    const before = await shared();
    await payload(await route.POST(request({ requestId: 'water-first', expectedRevision: 0 })), 409);
    assert.deepEqual(await shared(), before);
    assert.equal(await actualDB.prepare('SELECT count(*) AS n FROM mini_game_runs WHERE game_id=? AND player_id=?').bind(rules.MARATHON.gameId, playerIds[0]).first('n'), 1);
  });
  await check('special moods are shared, deterministic and multiply server water by two or one-half', async () => {
    for (const [kind, multiplier] of [['parched', 2], ['runners-high', 0.5]]) {
      let found = false;
      for (let slot = Math.ceil((now - startedAt) / rules.MARATHON.eventSlotMs) + 1; slot < 1000; slot++) {
        const candidate = startedAt + slot * rules.MARATHON.eventSlotMs + 10_000;
        const mood = rules.marathonMood({ startedAt }, candidate);
        if (mood.kind !== kind) continue;
        now = candidate;
        assert.deepEqual(rules.marathonMood({ startedAt }, now), mood);
        assert.equal(mood.multiplier, multiplier);
        assert.equal(rules.marathonMood({ startedAt }, mood.endsAt).kind, 'normal');
        await execute('UPDATE marathon_state SET last_watered_at=? WHERE id=1', now - 60_000);
        const context = await store.readMarathonContext(request());
        const snapshot = await payload(await route.POST(request({ requestId: `mood-${kind}`, expectedRevision: context.state.revision })));
        assert.equal(snapshot.lastWater.amountMl, 60 * multiplier);
        assert.equal(snapshot.lastWater.mood, kind);
        found = true;
        break;
      }
      assert.ok(found, `missing ${kind} event`);
    }
  });
  await check('authorization is rechecked at write after a session is revoked or member removed', async () => {
    now += 90_000;
    const context = await store.readMarathonContext(request(undefined, 2));
    const input = { requestId: 'revoked-water', expectedRevision: context.state.revision };
    const before = await shared();
    await execute('DELETE FROM sessions WHERE hash=?', hashes[2]);
    assert.equal((await store.waterMarathon(request(input, 2), context, input)).status, 'unauthorized');
    assert.deepEqual(await shared(), before);
    await execute('INSERT INTO sessions(hash,device_hash,expires) VALUES(?,?,0)', hashes[2], 'fixture-2');
    const active = await store.readMarathonContext(request(undefined, 2));
    await execute('UPDATE players SET sort_order=NULL WHERE id=?', playerIds[2]);
    assert.equal((await store.waterMarathon(request(input, 2), active, input)).status, 'unauthorized');
    assert.deepEqual(await shared(), before);
    await payload(await route.GET(request(undefined, 2)), 401);
  });
  await check('receipt failure rolls back shared thirst and score with the complete D1 batch', async () => {
    now += 90_000;
    const context = await store.readMarathonContext(request());
    const input = { requestId: 'rollback-water', expectedRevision: context.state.revision };
    const before = await shared();
    const beforeScore = await score(playerIds[0]);
    await execute("CREATE TRIGGER marathon_fixture_abort BEFORE INSERT ON mini_game_runs BEGIN SELECT RAISE(ABORT, 'fixture receipt failure'); END");
    await assert.rejects(store.waterMarathon(request(input), context, input), /fixture receipt failure/);
    await execute('DROP TRIGGER marathon_fixture_abort');
    assert.deepEqual(await shared(), before);
    assert.equal(await score(playerIds[0]), beforeScore);
  });
  await check('ranking uses cumulative ml and every statement remains within D1 bounds', async () => {
    const snapshot = await payload(await route.GET(request()));
    const sum = snapshot.leaderboard.reduce((total, entry) => total + entry.score, 0);
    assert.equal(sum, snapshot.state.totalWaterMl);
    assert.equal(snapshot.leaderboard[0].rank, 1);
    assert.ok(snapshot.leaderboard.every((entry, index, entries) => index === 0 || entries[index - 1].score >= entry.score));
    assert.ok(queries.every(query => query.values.length <= 100));
    assert.ok(queries.every(query => !/\bUNION\b/i.test(query.sql)));
    assert.ok(queries.every(query => !/\b(?:INSERT|UPDATE|DELETE)\b/.test(query.sql.trim().split(/\s+/)[0]) || /marathon_state|mini_game_scores|mini_game_runs/.test(query.sql)));
  });
  console.log(`PASS ${checks} isolated marathon checks; ${queries.length} bounded D1 statements.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  Date.now = realNow;
  await mf.dispose();
});
