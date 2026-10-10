// Isolated regression checks against Miniflare's actual D1/SQLite runtime.
// No existing application database, credentials, or remote service is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Miniflare } = require('miniflare');

const root = path.resolve(__dirname, '..');
const mf = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response("isolated regression fixture"); } };',
  compatibilityDate: '2026-05-15',
  d1Databases: ['DB'],
  d1Persist: false,
});
const cache = new Map();
const queries = [];
const databaseErrors = [];
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

// Drizzle's delimiter preserves multiline statements and trigger BEGIN/END.
// Splitting on semicolons would break the custom trigger in migration 0011.
function statements(sql) {
  return sql.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean);
}

const player = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const [p1, p2, p3, p4] = [1, 2, 3, 4].map(player);
const slotIds = ids => Array.from({ length: 9 }, (_, index) => ids[index] ?? null);
const idsFrom = data => data.slots.map(slot => slot.playerId);
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
async function payload(response, expected = 200) {
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}

(async () => {
  const actualDB = await mf.getD1Database('DB');
  await check('D1 runtime rejects six compound SELECT terms', async () => {
    await assert.rejects(
      actualDB.prepare(Array.from({ length: 6 }, (_, index) => `SELECT ${index} AS id`).join(' UNION ')).all(),
      /too many terms in compound SELECT/i,
    );
  });
  for (const file of fs.readdirSync(path.join(root, 'drizzle')).filter(file => /^00(?:0\d|1[0-3])_.*\.sql$/.test(file)).sort()) {
    const sql = fs.readFileSync(path.join(root, 'drizzle', file), 'utf8');
    await actualDB.batch(statements(sql).map(statement => actualDB.prepare(statement)));
  }
  const instrument = (statement, sql, values = []) => ({
    bind(...bindings) { return instrument(statement.bind(...bindings), sql, bindings); },
    async first(...args) {
      queries.push({ sql, values });
      try { return await statement.first(...args); }
      catch (error) { databaseErrors.push(error.message); throw error; }
    },
    async all(...args) { queries.push({ sql, values }); return statement.all(...args); },
    async run(...args) { queries.push({ sql, values }); return statement.run(...args); },
    async raw(...args) { queries.push({ sql, values }); return statement.raw(...args); },
    actual: statement,
  });
  DB = {
    prepare: sql => instrument(actualDB.prepare(sql), sql),
    async batch(items) { return actualDB.batch(items.map(item => item.actual)); },
  };
  const server = load('lib/server.ts');
  const store = load('lib/normalized-store.ts');
  const model = load('lib/model.ts');
  const dates = load('lib/schedule.ts');
  const route = load('lib/data-route.ts').dataRoute('team');
  const scheduleRoute = load('lib/data-route.ts').dataRoute('schedule');
  const statsRoute = load('lib/data-route.ts').dataRoute('stats');
  const now = new Date();
  const futureDate = dates.upcomingSaturday(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  const token = 'a'.repeat(64);
  const memberToken = 'b'.repeat(64);
  const request = (scope = 'team', body, authToken = token, query = '') => new Request(`http://localhost/api/${scope}${query}`, {
    method: body ? 'PUT' : 'GET',
    headers: { Origin: 'http://localhost', Cookie: `team_session=${authToken}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const execute = (sql, ...values) => actualDB.prepare(sql).bind(...values).run();
  for (let index = 1; index <= 4; index++) await execute(
    'INSERT INTO players(id,name,number,kana,sort_order,is_admin,can_edit_lineup) VALUES(?,?,?,?,?,?,?)',
    player(index), `Player ${index}`, String(index), '', index - 1, index === 1 ? 1 : 0, index === 1 ? 1 : 0,
  );
  for (const [sessionToken, playerId] of [[token, p1], [memberToken, p2]]) {
    const device = `fixture-${playerId}`;
    await execute('INSERT INTO member_devices(hash,player_id) VALUES(?,?)', device, playerId);
    await execute('INSERT INTO sessions(hash,device_hash,expires) VALUES(?,?,0)', await server.digest(sessionToken), device);
  }
  const createGame = async (id, date = futureDate, time = '09:00') => {
    await execute('INSERT INTO schedule_games(id,date,start_time,title,opponent) VALUES(?,?,?,?,?)', id, date, time, 'Fixture match', id);
  };
  const savedLineup = async (id, ids, mode = 'normal', pitcher = null) => {
    await execute('INSERT INTO schedule_lineups(schedule_id,mode,pitcher_id) VALUES(?,?,?)', id, mode, pitcher);
    for (const [index, playerId] of slotIds(ids).entries()) await execute(
      'INSERT INTO schedule_lineup_slots(schedule_id,batting_order,position,player_id) VALUES(?,?,?,?)',
      id, index, mode === 'dh' && index === 0 ? 'DH' : model.POSITIONS[index], playerId,
    );
  };
  await createGame('game-a');
  await createGame('game-b', futureDate, '14:00');
  await savedLineup('game-a', [p1, null, p2]);
  await savedLineup('game-b', [p3, null, p2], 'dh', p4);
  await execute('UPDATE team_settings SET schedule_id=?,game_date=?,schedule_week=? WHERE id=1', 'game-a', futureDate, dates.upcomingSaturday(now));
  for (const [index, playerId] of slotIds([p2, null, p1]).entries()) await execute('UPDATE lineup_slots SET player_id=? WHERE batting_order=?', playerId, index);
  for (const [number, id] of [[1, 'game-a'], [2, 'game-b']]) {
    await execute('INSERT INTO stats_games(game_date,game_number,schedule_id) VALUES(?,?,?)', futureDate, number, id);
    await execute('INSERT INTO player_game_stats(game_date,game_number,player_id) VALUES(?,?,?)', futureDate, number, p1);
  }

  let initial = await payload(await route.GET(request()));

  await check('team PUT switches same-day games and restores DH, pitcher and empty slots', async () => {
    initial = await payload(await route.PUT(request('team', { revision: initial.revision, data: { ...initial.data, scheduleId: 'game-b' } })));
    assert.equal(initial.data.scheduleId, 'game-b');
    assert.equal(initial.data.startTime, '14:00');
    assert.equal(initial.data.mode, 'dh');
    assert.equal(initial.data.pitcher, p4);
    assert.deepEqual(idsFrom(initial.data), slotIds([p3, null, p2]));
  });
  await check('switching back restores the previously working order and normal mode', async () => {
    initial = await payload(await route.PUT(request('team', { revision: initial.revision, data: { ...initial.data, scheduleId: 'game-a' } })));
    assert.equal(initial.data.mode, 'normal');
    assert.equal(initial.data.pitcher, null);
    assert.deepEqual(idsFrom(initial.data), slotIds([p2, null, p1]));
  });
  await check('stats confirmation retains each linked game batting order', async () => {
    const result = await payload(await statsRoute.GET(request('stats')));
    assert.deepEqual(result.lineups['game-a'], slotIds([p2, null, p1]));
    assert.deepEqual(result.lineups['game-b'], slotIds([p3, null, p2]));
    assert.equal(result.lineups['game-b'].includes(p4), false);
    assert.equal(result.data.scheduleIds[`${futureDate}|1`], 'game-a');
    assert.equal(result.data.scheduleIds[`${futureDate}|2`], 'game-b');
  });
  await check('stale revision is rejected without changing selected game', async () => {
    await payload(await route.PUT(request('team', { revision: initial.revision - 1, data: { ...initial.data, scheduleId: 'game-b' } })), 409);
    const selected = await actualDB.prepare('SELECT schedule_id FROM team_settings WHERE id=1').first();
    assert.equal(selected.schedule_id, 'game-a');
  });
  await check('unauthenticated and non-editor saves are rejected', async () => {
    const body = { revision: initial.revision, data: { ...initial.data, scheduleId: 'game-b' } };
    await payload(await route.PUT(request('team', body, '')), 401);
    await payload(await route.PUT(request('team', body, memberToken)), 403);
    await payload(await route.GET(request('team', undefined, '')), 401);
  });
  await check('partial schedule PUT updates a game and preserves unrelated orders', async () => {
    const snapshot = await payload(await scheduleRoute.GET(request('schedule', undefined, token, '?id=game-b')));
    const result = await payload(await scheduleRoute.PUT(request('schedule', {
      revision: snapshot.revision, partial: true, removedGames: [],
      data: { games: [{ ...snapshot.data.games[0], title: 'Edited fixture match' }] },
    })));
    assert.equal(result.data.games[0].title, 'Edited fixture match');
    const slots = await actualDB.prepare('SELECT player_id FROM schedule_lineup_slots WHERE schedule_id=? ORDER BY batting_order').bind('game-b').all();
    assert.deepEqual(slots.results.map(row => row.player_id), slotIds([p3, null, p2]));
  });
  await check('weekly cron selects its match and keeps registered game orders', async () => {
    const later = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const nextDate = dates.upcomingSaturday(later);
    await createGame('next-week', nextDate);
    await savedLineup('next-week', [p4, null, p2]);
    await execute('UPDATE team_settings SET schedule_week=? WHERE id=1', '2000-01-01');
    assert.equal(await store.syncScheduledOrder(DB, later), true);
    const selected = await actualDB.prepare('SELECT schedule_id FROM team_settings WHERE id=1').first();
    assert.equal(selected.schedule_id, 'next-week');
    const slots = await actualDB.prepare('SELECT player_id FROM lineup_slots ORDER BY batting_order').all();
    assert.deepEqual(slots.results.map(row => row.player_id), slotIds([p4, null, p2]));
    const retained = await actualDB.prepare('SELECT schedule_id FROM schedule_lineups').all();
    assert.ok(retained.results.some(row => row.schedule_id === 'game-a'));
    assert.ok(retained.results.some(row => row.schedule_id === 'game-b'));
    assert.equal(await store.syncScheduledOrder(DB, later), false);
  });
  assert.deepEqual(databaseErrors, []);
  console.log(`PASS ${checks} isolated Miniflare D1 checks; no existing or production DB accessed`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mf.dispose());
