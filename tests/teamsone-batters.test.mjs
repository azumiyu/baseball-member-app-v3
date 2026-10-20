import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const project = fileURLToPath(new URL("../", import.meta.url));
const modules = new Map();
async function moduleUrl(filename) {
  if (modules.has(filename)) return modules.get(filename);
  let code = ts.transpileModule(await readFile(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  for (const match of [...code.matchAll(/from\s+["'](\.[^"']+)["']/g)]) {
    let dependency = resolve(dirname(filename), match[1]);
    if (!extname(dependency)) dependency += ".ts";
    const url = await moduleUrl(dependency);
    code = code.replaceAll(`"${match[1]}"`, `"${url}"`).replaceAll(`'${match[1]}'`, `'${url}'`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  modules.set(filename, url);
  return url;
}
const { parseTeamsOneBatters, sortTeamsOneBatters, teamsOneColumnLeaders, parseTeamsOneFilters, teamsOneYears, teamsOneSourceUrl, TEAMS_ONE_BATTERS_URL, TEAMS_ONE_BATTERS_FRESH_MS } =
  await import(await moduleUrl(resolve(project, "lib/teamsone-batters.ts")));
const { createTeamsOneBattersLoader } = await import(await moduleUrl(resolve(project, "lib/teamsone-batters-cache.ts")));

// The real page uses one player cell followed by 26 statistic cells, including
// OPS with line breaks in its heading. No network or user database is used.
const headings = ["背番号", "試合数", "打率", "打席", "打数", "安打", "本塁打", "打点", "得点", "盗塁", "出塁率", "長打率", "得点圏打率", "O<br>P<br>S",
  "二塁打", "三塁打", "塁打数", "三振", "四球", "死球", "犠打", "犠飛", "併殺打", "敵失", "失策", "盗塁死", "盗塁阻止"];
const values = ["10", ".300", "40", "30", "9", "1", "4", "5", "2", ".400", ".500", ".333", ".900", "2", "0", "15", "3", "4", "1", "1", "1", "0", "1", "0", "0", "0"];
const fixture = ({ year = "2026", gameType = "", unreached = false, rows = [["1 選手&#65;", values], ["10 選手B", values]], columns = headings } = {}) => `
  <select id="search_result_game_date"><option value="">年度</option><option selected="selected" value="${year}">${year}</option></select>
  <select id="search_result_game_type"><option value="">試合属性</option>
    <option ${gameType === "official" ? 'selected="selected"' : ""} value="official">公式戦</option>
    <option ${gameType === "practice" ? 'selected="selected"' : ""} value="practice">練習試合</option></select>
  <input type="checkbox" id="unreached" value="true" ${unreached ? 'checked="checked"' : ""} />
  <table><thead><tr><th>広告</th></tr></thead><tbody><tr><td>ignore</td></tr></tbody></table>
  <table class="table table-responsive sortable"><thead><tr>${columns.map(label => `<th><p>${label}</p></th>`).join("")}</tr></thead>
  <tbody>${rows.map(([name, stats]) => `<tr><td class="playerName">${name}</td>${stats.map(value => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const response = html => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
const requestUrl = "https://example.test/api/teamsone/batters";

function setup() {
  let time = Date.parse("2026-10-20T03:00:00Z");
  let calls = 0;
  let failure = false;
  let html;
  let gate = Promise.resolve();
  const entries = new Map();
  const cache = { async match(key) { return entries.get(String(key))?.clone(); },
    async put(key, value) { entries.set(String(key), value.clone()); } };
  const options = {
    now: () => time,
    sharedCache: () => cache,
    fetchPage: async (url, init) => {
      calls++;
      const source = new URL(url);
      assert.equal(source.origin + source.pathname, TEAMS_ONE_BATTERS_URL);
      assert(source.searchParams.has("search_result[game_date]"));
      assert(source.searchParams.has("search_result[game_type]"));
      assert(init.signal instanceof AbortSignal);
      await gate;
      if (failure) throw new Error("Fixture upstream outage");
      return response(html ?? fixture({ year: source.searchParams.get("search_result[game_date]"), gameType: source.searchParams.get("search_result[game_type]"), unreached: source.searchParams.get("search_result[unreached]") === "true" }));
    },
  };
  return {
    loader: () => createTeamsOneBattersLoader(options),
    options, entries,
    get calls() { return calls; },
    advance(ms) { time += ms; },
    fail() { failure = true; },
    recover() { failure = false; },
    html(value) { html = value; },
    gate(value) { gate = value; },
  };
}

test("parses the published season and every statistic without changing decimal formatting", () => {
  const table = parseTeamsOneBatters(fixture());
  assert.equal(table.season, "2026");
  assert.equal(table.columns.length, 26);
  assert.equal(table.columns[12], "OPS");
  assert.equal(table.rows[0].name, "選手A");
  assert.equal(table.rows[0].number, "1");
  assert.deepEqual(table.rows[0].values, values);
  assert.equal(table.rows[0].values[1], ".300");
  assert.deepEqual(parseTeamsOneBatters(fixture({ rows: [] })).rows, []);
  assert.equal(parseTeamsOneBatters(fixture({ year: "" })).season, "通算");
});

test("rejects changed columns, broken rows, invalid values and non-table pages", () => {
  assert.throws(() => parseTeamsOneBatters(fixture({ columns: headings.slice(0, -1) })), /columns/);
  assert.throws(() => parseTeamsOneBatters(fixture({ rows: [["1 選手A", values.slice(1)]] })), /row/);
  assert.throws(() => parseTeamsOneBatters(fixture({ rows: [["1 選手A", ["unexpected", ...values.slice(1)]]] })), /value/);
  assert.throws(() => parseTeamsOneBatters("<html>ログインしてください</html>"));
  assert.throws(() => parseTeamsOneBatters(" ".repeat(512_001)), /large/);
});

test("numeric sorting handles leading decimals, OPS and missing values without mutating source order", () => {
  const rows = [
    { id: "a", number: "10", name: "A", values: [".300"] },
    { id: "b", number: "2", name: "B", values: ["1.100"] },
    { id: "c", number: "1", name: "C", values: ["-"] },
  ];
  assert.deepEqual(sortTeamsOneBatters(rows, 0, true).map(row => row.id), ["b", "a", "c"]);
  assert.deepEqual(sortTeamsOneBatters(rows, 0, false).map(row => row.id), ["a", "b", "c"]);
  assert.deepEqual(sortTeamsOneBatters(rows, -1, false).map(row => row.number), ["1", "2", "10"]);
  assert.deepEqual(rows.map(row => row.id), ["a", "b", "c"]);
});

test("25 simultaneous requests share one fetch, then memory and shared cache reuse it for 15 minutes", async () => {
  const fixture = setup();
  let release;
  fixture.gate(new Promise(resolve => { release = resolve; }));
  const load = fixture.loader();
  const waiting = Promise.all(Array.from({ length: 25 }, () => load(requestUrl)));
  release();
  const results = await waiting;
  assert.equal(fixture.calls, 1);
  assert(results.every(result => result.stale === false && result.rows.length === 2));
  await load(requestUrl + "?force=anything");
  await fixture.loader()(requestUrl);
  assert.equal(fixture.calls, 1, "a new Worker reuses the edge cache");
  assert.deepEqual([...fixture.entries.keys()], [requestUrl + "?cache=v3&year=2026&gameType=&unreached=0"]);
  fixture.advance(TEAMS_ONE_BATTERS_FRESH_MS - 1);
  await load(requestUrl);
  assert.equal(fixture.calls, 1);
  fixture.advance(2);
  await load(requestUrl);
  assert.equal(fixture.calls, 2);
});

test("an upstream outage keeps the last successful table and shares a 60-second retry delay", async () => {
  const fixture = setup();
  const load = fixture.loader();
  const original = await load(requestUrl);
  fixture.advance(TEAMS_ONE_BATTERS_FRESH_MS + 1);
  fixture.fail();
  const stale = await load(requestUrl);
  assert.equal(fixture.calls, 2);
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, original.fetchedAt);
  assert.deepEqual(stale.rows, original.rows);
  await load(requestUrl);
  await fixture.loader()(requestUrl);
  assert.equal(fixture.calls, 2, "cached failures do not repeatedly hit Teams.one");
  fixture.advance(60_001);
  fixture.recover();
  const fresh = await load(requestUrl);
  assert.equal(fixture.calls, 3);
  assert.equal(fresh.stale, false);
  assert.notEqual(fresh.fetchedAt, original.fetchedAt);
});

test("a cold outage is negatively cached across Worker instances", async () => {
  const fixture = setup();
  fixture.fail();
  const load = fixture.loader();
  await assert.rejects(load(requestUrl));
  await assert.rejects(load(requestUrl));
  await assert.rejects(fixture.loader()(requestUrl));
  assert.equal(fixture.calls, 1);
  fixture.advance(60_001);
  fixture.recover();
  assert.equal((await load(requestUrl)).stale, false);
  assert.equal(fixture.calls, 2);
});

test("a malformed page does not overwrite good cached data; data older than 24 hours is not returned", async () => {
  const fixture = setup();
  const load = fixture.loader();
  const original = await load(requestUrl);
  fixture.advance(TEAMS_ONE_BATTERS_FRESH_MS + 1);
  fixture.html("<html>maintenance</html>");
  const stale = await load(requestUrl);
  assert.deepEqual(stale.rows, original.rows);
  assert.equal(stale.fetchedAt, original.fetchedAt);
  fixture.advance(24 * 60 * 60 * 1000);
  await assert.rejects(load(requestUrl));
});

test("unavailable edge cache falls back to memory without repeated upstream requests", async () => {
  const fixture = setup();
  const load = createTeamsOneBattersLoader({ ...fixture.options, sharedCache() { throw new Error("Cache unavailable"); } });
  await load(requestUrl);
  await load(requestUrl);
  assert.equal(fixture.calls, 1);
});

test("body size is bounded even when Content-Length is absent", async () => {
  const fixture = setup();
  fixture.html(" ".repeat(512_001));
  await assert.rejects(fixture.loader()(requestUrl));
  assert.equal(fixture.calls, 1);
  const saved = await [...fixture.entries.values()][0].clone().json();
  assert.equal(saved.snapshot, null);
});

test("years extend automatically on the Japanese new year and filters reject unsupported values", () => {
  assert.deepEqual(teamsOneYears(new Date("2026-10-20T00:00:00Z")), [2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(teamsOneYears(new Date("2026-12-31T15:00:00Z")), [2022, 2023, 2024, 2025, 2026, 2027]);
  const now = new Date("2026-10-20T00:00:00Z");
  assert.deepEqual(parseTeamsOneFilters(requestUrl, now), { year: 2026, gameType: "" });
  assert.deepEqual(parseTeamsOneFilters(requestUrl + "?year=2022&gameType=practice", now), { year: 2022, gameType: "practice" });
  for (const query of ["year=2021", "year=2027", "year=2026.0", "year=", "gameType=others", "gameType=https://example.com"]) {
    assert.throws(() => parseTeamsOneFilters(requestUrl + "?" + query, now), /filters/);
  }
  const source = new URL(teamsOneSourceUrl({ year: 2025, gameType: "official" }));
  assert.equal(source.searchParams.get("search_result[game_date]"), "2025");
  assert.equal(source.searchParams.get("search_result[game_type]"), "official");
});

test("concurrent years and game types have independent data, pending requests and shared caches", async () => {
  const fixture = setup();
  const load = fixture.loader();
  const urls = [requestUrl + "?year=2025&gameType=official", requestUrl + "?year=2026&gameType=practice", requestUrl];
  const results = await Promise.all(urls.flatMap(url => [load(url), load(url)]));
  assert.equal(fixture.calls, 3);
  assert.deepEqual(results.map(row => [row.season, row.gameType]), [
    ["2025", "official"], ["2025", "official"], ["2026", "practice"], ["2026", "practice"], ["2026", ""], ["2026", ""],
  ]);
  const newWorker = fixture.loader();
  for (const url of urls) await newWorker(url);
  assert.equal(fixture.calls, 3);
  fixture.advance(TEAMS_ONE_BATTERS_FRESH_MS + 1);
  fixture.fail();
  const stale = await load(urls[0]);
  assert.equal(stale.season, "2025");
  assert.equal(stale.gameType, "official");
  await assert.rejects(load(requestUrl + "?year=2024&gameType=practice"));
  await assert.rejects(newWorker(requestUrl + "?year=2024&gameType=practice"));
  assert.equal(fixture.calls, 5, "failed combinations never reuse another filter's table");
});

test("upstream ignoring the requested year or game type never returns an unrelated table", async () => {
  const state = setup();
  state.html(fixture());
  const load = state.loader();
  await assert.rejects(load(requestUrl + "?year=2025"));
  await assert.rejects(load(requestUrl + "?year=2026&gameType=official"));
  assert.equal((await load(requestUrl)).season, "2026");
  assert.equal(state.calls, 3);
});

const { findPersonalBatter, personalMetricValue, personalMetricRank, PERSONAL_BATTING_METRICS } =
  await import(await moduleUrl(resolve(project, "lib/teamsone-personal.ts")));

test("career and unqualified filters have separate caches and use the published career table", async () => {
  const state = setup();
  const load = state.loader();
  const current = await load(requestUrl);
  const unqualified = await load(requestUrl + "?year=2026&unreached=true");
  const career = await load(requestUrl + "?year=all&unreached=true");
  assert.equal(current.season, "2026");
  assert.equal(unqualified.season, "2026");
  assert.equal(career.season, "通算");
  assert.equal(new URL(career.source).searchParams.get("search_result[game_date]"), "");
  assert.equal(new URL(career.source).searchParams.get("search_result[unreached]"), "true");
  const anotherWorker = state.loader();
  await anotherWorker(requestUrl + "?year=all&unreached=true");
  await anotherWorker(requestUrl + "?year=2026&unreached=true");
  await load(requestUrl);
  assert.equal(state.calls, 3);
  assert.deepEqual(parseTeamsOneFilters(requestUrl + "?year=all&unreached=true"), { year: "all", gameType: "", unreached: true });
  assert.throws(() => parseTeamsOneFilters(requestUrl + "?unreached=invalid"));
});

test("career selection defaults to the first empty option when no option has selected attribute", () => {
  const html = fixture({ year: "" }).replace('selected="selected"', '');
  assert.equal(parseTeamsOneBatters(html).season, "通算");
});

test("upstream ignoring the unqualified filter never reports a player as missing", async () => {
  const state = setup();
  state.html(fixture());
  await assert.rejects(state.loader()(requestUrl + "?unreached=true"));
});

test("personal matching normalizes spaces and full-width names, allows changed numbers, and rejects another player", () => {
  const rows = [
    { id: "1", number: "10", name: "根岸 彪雅", values },
    { id: "2", number: "1", name: "選手Ａ", values },
  ];
  assert.equal(findPersonalBatter(rows, { name: "根岸　彪雅", number: "10" }).player?.id, "1");
  assert.equal(findPersonalBatter(rows, { name: "選手 A", number: "99" }).player?.id, "2");
  assert.equal(findPersonalBatter(rows, { name: "別の選手", number: "10" }).player, undefined);
  assert.equal(findPersonalBatter(rows, { name: "", number: "10" }).player, undefined);
  const duplicate = [...rows, { id: "3", name: "根岸彪雅", number: "20", values }];
  assert.equal(findPersonalBatter(duplicate, { name: "根岸彪雅", number: "010" }).player?.id, "1");
  assert.equal(findPersonalBatter(duplicate, { name: "根岸彪雅", number: "99" }).ambiguous, true);
});

test("all 21 personal metrics map to published columns and keep decimal formatting", () => {
  const player = { id: "1", number: "1", name: "選手A", values };
  assert.equal(PERSONAL_BATTING_METRICS.length, 21);
  assert.equal(personalMetricValue(player, "打率"), ".300");
  assert.equal(personalMetricValue(player, "本塁打"), "1");
  assert.equal(personalMetricValue(player, "OPS"), ".900");
  assert.equal(personalMetricValue(player, "盗塁阻止"), "0");
  assert.equal(personalMetricValue(undefined, "打率"), "—");
});

test("published players without a jersey number do not prevent reading other players", () => {
  const table = parseTeamsOneBatters(fixture({ rows: [["横尾　陸", values], ["28 戸田 朋幸", values]] }));
  assert.equal(table.rows[0].number, "-");
  assert.equal(table.rows[0].name, "横尾 陸");
  assert.equal(table.rows[1].name, "戸田 朋幸");
});

test("personal crowns use descending competition ranks and ties skip the following place", () => {
  const players = [".400", ".400", ".300", ".200"].map((value, index) => ({
    id: String(index), name: `選手${index}`, number: String(index), values: ["10", value],
  }));
  assert.deepEqual(players.map(player => personalMetricRank(players, player, "打率")), [1, 1, 3, 4]);
  assert.deepEqual(players.map(player => personalMetricRank(players, player, "試合数")), [1, 1, 1, 1]);
  assert.deepEqual(players.map(player => player.values[1]), [".400", ".400", ".300", ".200"]);
});

test("every requested column including strikeouts, double plays and errors ranks larger values first", () => {
  for (const [column] of PERSONAL_BATTING_METRICS) {
    const index = headings.indexOf(column === "OPS" ? "O<br>P<br>S" : column) - 1;
    const players = [1, 8, 3].map((value, id) => ({ id: String(id), name: `選手${id}`, number: String(id), values: values.map((original, position) => position === index ? String(value) : original) }));
    assert.deepEqual(players.map(player => personalMetricRank(players, player, column)), [3, 1, 2], column);
  }
});

test("rank ignores missing numbers and never awards unrecognized or missing personal results", () => {
  const players = ["1,000", "100", "-", "—", "", "NaN", "0"].map((value, id) => ({ id: String(id), number: String(id), name: `選手${id}`, values: [value] }));
  assert.deepEqual(players.map(player => personalMetricRank(players, player, "試合数")), [1, 2, undefined, undefined, undefined, undefined, undefined]);
  assert.equal(personalMetricRank(players, undefined, "試合数"), undefined);
  assert.equal(personalMetricRank(players, { id: "absent", name: "別の選手", number: "99", values: ["999"] }, "試合数"), undefined);
});

test("zero values never receive crowns for any metric, including decimal zero rates and tied leaders", () => {
  for (const [column] of PERSONAL_BATTING_METRICS) {
    for (const zero of ["0", ".000", "0.000", "00", "0.0"]) {
      const players = [0, 1].map(id => ({ id: String(id), name: `選手${id}`, number: String(id), values: values.map(() => zero) }));
      assert.equal(personalMetricRank(players, players[0], column), undefined, `${column}: ${zero}`);
    }
  }
});

test("table leaders compare numbers, highlight ties and ignore missing values independently of sorting", () => {
  const players = [
    { id: "a", number: "1", name: "A", values: ["1,000", ".400", "-"] },
    { id: "b", number: "2", name: "B", values: ["900", "0.400", "—"] },
    { id: "c", number: "3", name: "C", values: ["1,000", ".300", ""] },
  ];
  const leaders = teamsOneColumnLeaders(players);
  assert.deepEqual([...leaders[0]], ["a", "c"]);
  assert.deepEqual([...leaders[1]], ["a", "b"]);
  assert.equal(leaders[2].size, 0);
  assert(teamsOneColumnLeaders([]).every(column => column.size === 0));
  const reordered = teamsOneColumnLeaders(sortTeamsOneBatters(players, 0, false));
  assert.deepEqual(reordered.map(column => [...column].sort()), leaders.map(column => [...column].sort()));
  assert.deepEqual([...teamsOneColumnLeaders(players.slice(1))[0]], ["c"], "leaders follow the current filtered table");
});

test("zero leaders remain unhighlighted in all columns including .000 rates", () => {
  const players = ["0", ".000", "0.000"].map((zero, id) => ({ id: String(id), number: String(id), name: `選手${id}`, values: headings.slice(1).map(() => zero) }));
  assert(teamsOneColumnLeaders(players).every(column => column.size === 0));
  const positive = { id: "positive", number: "99", name: "選手", values: headings.slice(1).map(() => "1") };
  assert(teamsOneColumnLeaders([...players, positive]).every(column => column.size === 1 && column.has("positive")));
});
