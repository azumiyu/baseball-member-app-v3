/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable -- Standalone Node CommonJS verification harness. */
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
    const migrationFixtureId = '00000000-0000-4000-8000-000000000099';
    const runnerBefore = file === '0028_tiresome_paper_doll.sql'
      ? await actualDB.prepare('SELECT started_at,last_watered_at,total_water_ml FROM marathon_state WHERE id=1').first()
      : null;
    if (runnerBefore) {
      await actualDB.prepare('INSERT INTO players(id,name,number,kana,sort_order) VALUES(?,?,?,?,NULL)')
        .bind(migrationFixtureId, 'Migration fixture', '99', '').run();
      await actualDB.prepare(`INSERT INTO marathon_shop_inventory(
        player_id,mini_kobayashi_count,reservoir_owned,reservoir_ml,reservoir_growth_japan_date,
        reservoir_last_deposit_at,reservoir_god_count,japan_date,last_purchase_request_id,last_purchase_result_json
      ) VALUES(?,2,1,1234,'2026-03-01',42,1,'2026-03-02','migration-preserve','{"item":"mini-kobayashi"}')`)
        .bind(migrationFixtureId).run();
    }
    await actualDB.batch(statements(fs.readFileSync(path.join(root, 'drizzle', file), 'utf8')).map(sql => actualDB.prepare(sql)));
    if (runnerBefore) {
      await check('alcohol migration preserves existing marathon and shop data', async () => {
        const runnerAfter = await actualDB.prepare('SELECT started_at,last_watered_at,total_water_ml,drunk_effect FROM marathon_state WHERE id=1').first();
        const inventory = await actualDB.prepare(`SELECT mini_kobayashi_count,reservoir_owned,reservoir_ml,
          reservoir_growth_japan_date,reservoir_last_deposit_at,reservoir_god_count,alcohol_count,
          alcohol_purchases,last_purchase_request_id,last_purchase_result_json
          FROM marathon_shop_inventory WHERE player_id=?`).bind(migrationFixtureId).first();
        assert.deepEqual(
          [runnerAfter.started_at, runnerAfter.last_watered_at, runnerAfter.total_water_ml, runnerAfter.drunk_effect],
          [runnerBefore.started_at, runnerBefore.last_watered_at, runnerBefore.total_water_ml, null],
        );
        assert.deepEqual(
          [inventory.mini_kobayashi_count, inventory.reservoir_owned, inventory.reservoir_ml,
            inventory.reservoir_growth_japan_date, inventory.reservoir_last_deposit_at, inventory.reservoir_god_count,
            inventory.alcohol_count, inventory.alcohol_purchases, inventory.last_purchase_request_id, inventory.last_purchase_result_json],
          [2, 1, 1234, '2026-03-01', 42, 1, 0, 0, 'migration-preserve', '{"item":"mini-kobayashi"}'],
        );
      });
      await actualDB.prepare('DELETE FROM players WHERE id=?').bind(migrationFixtureId).run();
    }
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
  rules.rollMarathonGacha = () => ({ kind: 'normal', label: '通常給水', multiplier: 1 });
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
  await check('drunken outcomes are equally addressable and generous pricing is exactly twenty percent off', async () => {
    assert.deepEqual([0, 1, 2, 3].map(rules.marathonDrunkEffectForRoll), [
      'super-dehydrated', 'rampage', 'stopped', 'generous',
    ]);
    assert.deepEqual(['super-dehydrated', 'rampage', 'stopped', 'generous'].map(rules.marathonDrunkEffectLabel), [
      '超脱水', '大暴れ', '停止', '大奮発',
    ]);
    assert.equal(rules.marathonDiscountedShopPrice(60_000, 'generous', now + 1, now), 48_000);
    assert.equal(rules.marathonDiscountedShopPrice(60_000, 'generous', now, now), 60_000);
  });
  await check('stopped drunkenness freezes accumulated water and resumes after the event', async () => {
    const state = {
      startedAt: 0, lastWateredAt: 30_000, drunkEffect: 'stopped',
      drunkStartedAt: 90_000, drunkUntil: 270_000,
    };
    const atStopStart = rules.marathonAvailableWaterMl(state, state.drunkStartedAt);
    assert.equal(rules.marathonAvailableWaterMl(state, state.drunkStartedAt + 30_000), atStopStart);
    assert.equal(rules.marathonWaterElapsedMs(state, state.drunkStartedAt + 30_000),
      state.drunkStartedAt - state.lastWateredAt);
    const afterStop = state.drunkUntil + 10_000;
    const activeSeconds = (afterStop - state.lastWateredAt - (state.drunkUntil - state.drunkStartedAt)) / 1_000;
    assert.equal(rules.marathonWaterElapsedMs(state, afterStop), activeSeconds * 1_000);
    assert.equal(rules.marathonAvailableWaterMl(state, afterStop),
      Math.floor(activeSeconds * rules.marathonMood(state, afterStop).multiplier));
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
  await check('water uses server elapsed time and one fixed four-write transaction', async () => {
    await execute('UPDATE marathon_state SET last_watered_at=? WHERE id=1', now - 120_000);
    const count = queries.length;
    first = await payload(await route.POST(request({ requestId: 'water-first', expectedRevision: 0, amountMl: 999999999, serverNow: now + 999999999 })));
    assert.equal(queries.length - count, 6); // Read, four atomic writes, read.
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
  await check('ranking combines hand water and reservoir balance without changing wallet balances', async () => {
    for (const [index, amount] of [100, 50, 300].entries()) {
      await execute(`INSERT INTO mini_game_scores(game_id,player_id,score,achieved_at) VALUES(?,?,?,?)
        ON CONFLICT(game_id,player_id) DO UPDATE SET score=excluded.score,achieved_at=excluded.achieved_at`,
      rules.MARATHON.gameId, playerIds[index], amount, now);
    }
    await execute('UPDATE players SET sort_order=2 WHERE id=?', playerIds[2]);
    await execute(`INSERT INTO marathon_shop_inventory(player_id,japan_date,reservoir_owned,reservoir_ml,reservoir_growth_japan_date)
      VALUES(?,?,1,1000,?)`, playerIds[1], rules.marathonJapanDate(now), rules.marathonJapanDate(now));
    const snapshot = await payload(await route.GET(request(undefined, 1)));
    assert.deepEqual(snapshot.leaderboard.map(entry => [entry.playerId, entry.score]), [
      [playerIds[1], 1050], [playerIds[2], 300], [playerIds[0], 100],
    ]);
    assert.equal(snapshot.shop.handMl, 50);
    assert.equal(snapshot.shop.reservoirMl, 1000);
    assert.equal(snapshot.shop.walletMl, 1050);
    assert.equal(await score(playerIds[1]), 50);
    assert.equal(snapshot.personalBest.score, 1050);
    assert.equal(snapshot.leaderboard[0].rank, 1);
    assert.ok(snapshot.leaderboard.every((entry, index, entries) => index === 0 || entries[index - 1].score >= entry.score));
  });
  await check('alcohol costs five liters, is capped at three daily purchases and starts a shared effect', async () => {
    await execute(`INSERT INTO mini_game_scores(game_id,player_id,score,achieved_at) VALUES(?,?,?,?)
      ON CONFLICT(game_id,player_id) DO UPDATE SET score=excluded.score,achieved_at=excluded.achieved_at`,
    rules.MARATHON.gameId, playerIds[0], 100_000, now);
    for (let index = 0; index < 3; index++) {
      const context = await store.readMarathonContext(request());
      const purchased = await payload(await route.POST(request({
        action: 'shop-buy', requestId: `alcohol-buy-${index}`, expectedRevision: context.state.revision, item: 'alcohol',
      })));
      assert.equal(purchased.lastShopPurchase.costMl, 5_000);
      assert.equal(purchased.shop.alcoholCount, index + 1);
      assert.equal(purchased.shop.alcoholPurchasesToday, index + 1);
    }
    const cappedContext = await store.readMarathonContext(request());
    const capped = await payload(await route.POST(request({
      action: 'shop-buy', requestId: 'alcohol-buy-capped', expectedRevision: cappedContext.state.revision, item: 'alcohol',
    })), 409);
    assert.match(capped.error, /1日3回まで/);
    rules.rollMarathonDrunkEffect = () => 'super-dehydrated';
    now += 90_000;
    const context = await store.readMarathonContext(request());
    const expectedAmount = rules.marathonAvailableWaterMl(context.state, now);
    const regularAmountBeforeDrink = expectedAmount;
    const watered = await payload(await route.POST(request({
      requestId: 'alcohol-water', expectedRevision: context.state.revision, alcohol: true,
    })));
    assert.equal(watered.lastWater.alcoholGiven, true);
    assert.equal(watered.lastWater.amountMl, regularAmountBeforeDrink);
    assert.equal(watered.lastWater.drunkEffect, 'super-dehydrated');
    assert.equal(watered.state.drunkUntil, now + rules.MARATHON_DRUNK_DURATION_MS);
    assert.equal(watered.shop.alcoholCount, 2);
    assert.equal(watered.shop.pricesMl.alcohol, 5_000);
    const boostedAt = now + 60_000;
    assert.equal(rules.marathonAvailableWaterMl({ ...watered.state, lastWateredAt: now }, boostedAt),
      Math.floor(60 * rules.marathonMood(watered.state, boostedAt).multiplier * 10));
    const blockedContext = await store.readMarathonContext(request(undefined, 1));
    await payload(await route.POST(request({
      requestId: 'alcohol-water-blocked', expectedRevision: blockedContext.state.revision, alcohol: true,
    }, 1)), 409);
  });
  await check('expired stopped event is excluded from distance and rampage is awarded all at once', async () => {
    const stoppedStart = 60_000;
    const stoppedEnd = stoppedStart + rules.MARATHON_DRUNK_DURATION_MS;
    assert.equal(rules.marathonDistanceKm({
      startedAt: 0, distancePausedMs: 0, drunkEffect: 'stopped',
      drunkStartedAt: stoppedStart, drunkUntil: stoppedEnd,
    }, stoppedEnd + 60_000), 0.6);
    now += rules.MARATHON_DRUNK_DURATION_MS + 60_000;
    rules.rollMarathonDrunkEffect = () => 'rampage';
    const beforeContext = await store.readMarathonContext(request());
    const totalBeforeRampage = beforeContext.state.totalWaterMl;
    const scoresBefore = await Promise.all(playerIds.map(score));
    const started = await payload(await route.POST(request({
      requestId: 'rampage-water', expectedRevision: beforeContext.state.revision, alcohol: true,
    })));
    const goal = started.state.drunkRampageGoalMl;
    assert.ok(goal >= 5_000 && goal <= 20_000);
    assert.equal(started.state.drunkEffect, 'rampage');
    assert.equal(started.state.drunkRampageAwardedMl, goal);
    assert.equal(started.state.totalWaterMl, totalBeforeRampage + started.lastWater.amountMl + goal);
    const scoresAtStart = await Promise.all(playerIds.map(score));
    assert.equal(scoresAtStart.reduce((sum, value, index) => sum + value - scoresBefore[index], 0),
      started.lastWater.amountMl + goal, JSON.stringify({ goal, amountMl: started.lastWater.amountMl, scoresBefore, scoresAtStart }));
    const shares = new Map(started.state.drunkRampagePlayerIds.map((playerId, index, ids) => [
      playerId, Math.floor(goal * (index + 1) / ids.length) - Math.floor(goal * index / ids.length),
    ]));
    for (let index = 0; index < playerIds.length; index++) {
      assert.equal(scoresAtStart[index] - scoresBefore[index],
        (shares.get(playerIds[index]) ?? 0) + (playerIds[index] === playerIds[0] ? started.lastWater.amountMl : 0));
    }
    now = started.state.drunkUntil;
    const settled = await payload(await route.GET(request()));
    assert.equal(settled.state.drunkRampageAwardedMl, goal);
    const scoresAfter = await Promise.all(playerIds.map(score));
    assert.equal(settled.state.totalWaterMl, started.state.totalWaterMl);
    assert.deepEqual(scoresAfter, scoresAtStart);
    const readAgain = await payload(await route.GET(request()));
    assert.equal(readAgain.state.totalWaterMl, settled.state.totalWaterMl);
    assert.deepEqual(await Promise.all(playerIds.map(score)), scoresAfter);
    now += 15_000;
    rules.rollMarathonDrunkEffect = () => 'generous';
    const generousContext = await store.readMarathonContext(request());
    const saleStarted = await payload(await route.POST(request({
      requestId: 'generous-water', expectedRevision: generousContext.state.revision, alcohol: true,
    })));
    assert.equal(saleStarted.shop.pricesMl['steal-guard'], 48_000);
    const saleBought = await payload(await route.POST(request({
      action: 'shop-buy', requestId: 'discounted-guard-buy',
      expectedRevision: saleStarted.state.revision, item: 'steal-guard',
    })));
    assert.equal(saleBought.lastShopPurchase.costMl, 48_000);
    assert.equal(saleBought.shop.stealGuardCharges, 3);
    const stoppedAt = now + 30_000;
    await execute(`UPDATE marathon_state SET revision=revision+1,drunk_effect='stopped',
      drunk_started_at=?,drunk_until=? WHERE id=1`, stoppedAt, stoppedAt + rules.MARATHON_DRUNK_DURATION_MS);
    const stoppedContext = await store.readMarathonContext(request(undefined, 1));
    const frozenElapsed = rules.marathonWaterElapsedMs(stoppedContext.state, stoppedAt);
    assert.equal(rules.marathonWaterElapsedMs(stoppedContext.state, stoppedAt + 60_000), frozenElapsed);
    const stateBeforeBlockedWater = await shared();
    now = stoppedAt + 60_000;
    const blockedWater = await payload(await route.POST(request({
      requestId: 'water-during-stop', expectedRevision: stoppedContext.state.revision,
    }, 1)), 409);
    assert.match(blockedWater.error, /停止中/);
    assert.deepEqual(await shared(), stateBeforeBlockedWater);
  });
  await check('every statement remains within D1 bounds', async () => {
    assert.ok(queries.every(query => query.values.length <= 100));
    assert.ok(queries.every(query => !/\bUNION\b/i.test(query.sql)));
    assert.ok(queries.every(query => !/\b(?:INSERT|UPDATE|DELETE)\b/.test(query.sql.trim().split(/\s+/)[0]) || /marathon_state|mini_game_scores|mini_game_runs/.test(query.sql)));
  });
  console.log(`PASS ${checks} isolated marathon checks; ${queries.length} bounded D1 statements.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  Date.now = realNow;
  await mf.dispose();
});
