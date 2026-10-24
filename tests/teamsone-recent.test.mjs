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
const { parseTeamsOneFilters, teamsOneCanUseRecentGames, teamsOneFilterKey, teamsOneSourceUrl, teamsOneColumns } = await import(await moduleUrl(resolve(project, "lib/teamsone-batters.ts")));
const { parseTeamsOneRecentGames, parseTeamsOneGamePlayers, aggregateTeamsOneRecentStats, loadTeamsOneRecentStats } = await import(await moduleUrl(resolve(project, "lib/teamsone-recent.ts")));
const { createTeamsOneBattersLoader } = await import(await moduleUrl(resolve(project, "lib/teamsone-batters-cache.ts")));
const now = new Date("2026-10-24T03:00:00Z");
const request = "https://example.test/api/teamsone/batters?year=2026";
const headers = {
  batting: ["#", "選手名", "出場", "打順", "守備", "打席", "打数", "安打", "本", "打点", "得点", "盗塁", "二塁打", "三塁打", "得点圏打数", "得点圏安打", "三振", "四球", "死球", "犠打", "犠飛", "併殺打", "敵失", "失策", "盗塁死", "盗塁阻止"],
  pitching: ["#", "選手名", "勝敗", "投球回", "投球数", "失点", "自責点", "完投", "完封", "被安打", "被本塁打", "奪三振", "与四球", "与死球", "ボーク", "暴投", "登板順"],
};
const game = (id, date = `2026/10/${24 - id}`, type = "公式戦", result = "勝ち") => `<li><a class="toDetailLink" href="/teams/ygfires/game/${id}"><p class="date">${date}<span>（土）</span></p><p class="opponent"><span>${type}</span>相手${id}</p><p class="score">3-1</p><p class="result"><span>${result}</span></p></a></li>`;
const list = Array.from({ length: 7 }, (_, index) => game(index + 1)).join("");
const batting = (stats = {}, number = "1", name = "選手A", id = "10") => headers.batting.map(column => ({ "#": number, "選手名": id ? `<a href="/teams/ygfires/player/${id}">${name}</a>` : name, "出場": "先発", "打順": "1", "守備": "中", ...stats })[column] ?? "0");
const pitching = (stats = {}, number = "1", name = "選手A", id = "10") => headers.pitching.map(column => ({ "#": number, "選手名": id ? `<a href="/teams/ygfires/player/${id}">${name}</a>` : name, "勝敗": "-", "投球回": "1<span>回</span>0/3", ...stats })[column] ?? "0");
const detail = (kind, rows) => `<table class="stats_${kind} table"><thead><tr>${headers[kind].map(value => `<th>${value}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const base = (kind = "batting", rows) => ({ kind, season: "2026", columns: [...teamsOneColumns(kind)], rows: rows ?? [{ id: "1:選手A", name: "選手A", number: "1", values: teamsOneColumns(kind).map(column => column === "防御率" ? "2.10" : column === "自責点" ? "3" : column === "投球回" ? "10回0/3" : "0") }], gameType: "", opponent: "", tournament: "", opponents: [], tournaments: [] });
const games = Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1), date: `2026-10-${23 - index}`, opponent: "対戦相手", url: `https://teams.one/teams/ygfires/game/${index + 1}` }));
const value = (table, column, index = 0) => table.rows[index].values[table.columns.indexOf(column)];

// The ordinary published table remains the source of the year's qualification membership.
const annualHtml = (kind = "batting", unreached = false) => {
  const table = base(kind);
  return `<select id="search_result_game_date"><option value="2026" selected>2026</option></select><select id="search_result_game_type"><option value="" selected>試合属性</option></select><select id="search_result_opponent_team_name"><option value="" selected>指定なし</option></select><select id="search_result_tournament_name"><option value="" selected>指定なし</option></select><input type="checkbox" id="unreached" ${unreached ? "checked" : ""}><table><thead><tr>${["背番号", ...table.columns].map(column => `<th>${column}</th>`).join("")}</tr></thead><tbody><tr><td>1 選手A</td>${table.rows[0].values.map(number => `<td>${number}</td>`).join("")}</tr></tbody></table>`;
};

test("recent mode is accepted only with all four default filters, independently of kind/unreached", () => {
  assert.deepEqual(parseTeamsOneFilters(request + "&recent5=true&unreached=true&kind=pitching", now), { year: 2026, gameType: "", recent5: true, unreached: true, kind: "pitching" });
  for (const query of ["year=2025", "year=all", "year=2026&gameType=official", "year=2026&opponent=相手", "year=2026&tournament=大会", "year=2026&recent5=1"]) {
    assert.throws(() => parseTeamsOneFilters(`https://example.test/?${query}${query.includes("recent5=") ? "" : "&recent5=true"}`, now));
  }
  assert.equal(teamsOneCanUseRecentGames({ year: 2027, gameType: "" }, new Date("2026-12-31T15:00:00Z")), true);
  assert.equal(parseTeamsOneFilters(request + "&recent5=false", now).recent5, undefined);
  assert.notEqual(teamsOneFilterKey({ year: 2026, gameType: "" }), teamsOneFilterKey({ year: 2026, gameType: "", recent5: true }));
  assert.equal(new URL(teamsOneSourceUrl({ year: 2026, gameType: "", recent5: true })).pathname, "/teams/ygfires/game");
});

test("completed games exclude future/other/unfinished games and preserve doubleheaders", () => {
  const html = game(10, "2026/10/25") + game(11, "2026/10/24", "その他", "その他") + game(12, "2026/10/23", "練習試合", "") + game(13, "2025/10/24") + game(14, "2026/10/24") + game(15, "2026/10/24", "練習試合", "引き分け");
  assert.deepEqual(parseTeamsOneRecentGames(html, 2026, now).games.map(row => row.id), ["14", "15"]);
  assert.throws(() => parseTeamsOneRecentGames("<html>エラー</html>", 2026, now));
  assert.deepEqual(parseTeamsOneRecentGames("該当する試合がありません", 2026, now).games, []);
});

test("batting sums raw counts and recalculates rates, OPS and RISP across games", () => {
  const first = parseTeamsOneGamePlayers(detail("batting", [batting({ 打席: "2", 打数: "1", 安打: "1", 本: "1", 打点: "3", 四球: "1", 得点圏打数: "1", 得点圏安打: "1" })]), "batting");
  const second = parseTeamsOneGamePlayers(detail("batting", [batting({ 打席: "10", 打数: "9", 安打: "1", 二塁打: "1", 犠飛: "1", 得点圏打数: "3", 得点圏安打: "0" })]), "batting");
  const result = aggregateTeamsOneRecentStats(base(), games.slice(0, 2), [first, second], true);
  assert.equal(result.season, "直近5試合");
  assert.equal(value(result, "試合数"), "2");
  assert.equal(value(result, "打率"), ".200");
  assert.equal(value(result, "出塁率"), ".250");
  assert.equal(value(result, "長打率"), ".600");
  assert.equal(value(result, "OPS"), ".850");
  assert.equal(value(result, "得点圏打率"), ".250");
  assert.equal(value(result, "塁打数"), "6");
  assert.equal(value(result, "本塁打"), "1");
  assert.equal(value(result, "打点"), "3");
});

test("pitching sums fractional outs, flags, decisions and uses the published team's ERA base", () => {
  const first = parseTeamsOneGamePlayers(detail("pitching", [pitching({ 勝敗: "勝", 投球回: "1<span>回</span>1/3", 自責点: "1", 完投: "○", 完封: "-", 奪三振: "2" })]), "pitching");
  const second = parseTeamsOneGamePlayers(detail("pitching", [pitching({ 勝敗: "S", 投球回: "0<span>回</span>2/3", 自責点: "1", 完投: "-", 完封: "○", 奪三振: "3" })]), "pitching");
  const result = aggregateTeamsOneRecentStats(base("pitching"), games.slice(0, 2), [first, second], true);
  assert.equal(value(result, "試合数"), "2");
  assert.equal(value(result, "投球回"), "2回0/3");
  assert.equal(value(result, "防御率"), "7.00");
  assert.equal(value(result, "勝"), "1");
  assert.equal(value(result, "セーブ"), "1");
  assert.equal(value(result, "完投"), "1");
  assert.equal(value(result, "完封"), "1");
  assert.equal(value(result, "奪三振"), "5");
  assert.equal(value(result, "勝率"), "1.000");
  const nine = base("pitching");nine.rows[0].values[nine.columns.indexOf("防御率")] = "2.70";
  assert.equal(value(aggregateTeamsOneRecentStats(nine, games.slice(0, 2), [first, second], true), "防御率"), "9.00");
});

test("annual qualification filters players without changing their recent-game values", () => {
  const entries = parseTeamsOneGamePlayers(detail("batting", [batting({ 打数: "2", 安打: "1" }), batting({ 打数: "1", 安打: "1" }, "99", "別の選手", "99")]), "batting");
  const qualified = aggregateTeamsOneRecentStats(base(), games.slice(0, 1), [entries], false);
  const all = aggregateTeamsOneRecentStats(base(), games.slice(0, 1), [entries], true);
  assert.equal(qualified.rows.length, 1);
  assert.equal(all.rows.length, 2);
  assert.deepEqual(qualified.rows[0], all.rows[0]);
  assert.equal(value(qualified, "打率"), ".500");
});

test("player ids merge number changes, and duplicate appearances count only one game", () => {
  const entries = parseTeamsOneGamePlayers(detail("batting", [batting({ 打数: "1", 安打: "1" }), batting({ 打数: "2", 安打: "1" }, "10")]), "batting");
  const result = aggregateTeamsOneRecentStats(base(), games.slice(0, 1), [entries], true);
  assert.equal(result.rows.length, 1);
  assert.equal(value(result, "試合数"), "1");
  assert.equal(value(result, "打数"), "3");
  assert.equal(result.rows[0].number, "1");
});

test("changed/missing detail tables fail rather than silently publishing partial totals", () => {
  assert.throws(() => parseTeamsOneGamePlayers("<html>成績なし</html>", "batting"));
  assert.throws(() => parseTeamsOneGamePlayers(detail("batting", []), "batting"));
  assert.throws(() => parseTeamsOneGamePlayers(detail("batting", [batting({ 安打: "不明" })]), "batting"));
  assert.throws(() => parseTeamsOneGamePlayers(detail("pitching", [pitching({ 投球回: "1回3/3" })]), "pitching"));
  assert.throws(() => parseTeamsOneGamePlayers(detail("batting", [batting()]).replace("<th>盗塁</th>", "<th>変更</th>"), "batting"));
  assert.throws(() => aggregateTeamsOneRecentStats(base(), games, [], true));
});

test("loading selects exactly five games and limits detail fetches to two at a time", async () => {
  let busy = 0, maximum = 0;const urls = [];
  const read = async url => {
    urls.push(url);
    if (!/\/game\/\d+$/.test(url)) return list;
    busy++;maximum = Math.max(maximum, busy);await new Promise(resolve => setTimeout(resolve, 5));busy--;
    return detail("batting", [batting({ 打数: "1", 安打: "1" })]);
  };
  const result = await loadTeamsOneRecentStats(base(), { year: 2026, gameType: "", recent5: true }, read, now);
  assert.equal(maximum, 2);
  assert.equal(urls.length, 6);
  assert.deepEqual(result.recentGames.map(game => game.id), ["1", "2", "3", "4", "5"]);
  assert.equal(value(result, "試合数"), "5");
});

test("safe pagination fills the window, deduplicates games and supports fewer than five", async () => {
  const result = await loadTeamsOneRecentStats(base(), { year: 2026, gameType: "", recent5: true }, async url => {
    if (/\/game\/\d+$/.test(url)) return detail("batting", [batting()]);
    return new URL(url).searchParams.has("page") ? game(1) + game(2) : game(1) + '<a rel="next" href="/teams/ygfires/game?page=2&amp;search_result%5Bgame_date%5D=2026">次</a>';
  }, now);
  assert.equal(result.recentGames.length, 2);
  assert.equal(value(result, "試合数"), "2");
  assert.throws(() => parseTeamsOneRecentGames(list + '<a rel="next" href="https://evil.example/">次</a>', 2026, now));
});

function setup() {
  let time = now.getTime(), fail = false;const urls = [];const entries = new Map();
  const options = { now: () => time, sharedCache: () => ({ match: async key => entries.get(key)?.clone(), put: async (key, value) => entries.set(key, value.clone()) }),
    fetchPage: async url => {
      urls.push(String(url));const parsed = new URL(url);
      if (/\/game\/\d+$/.test(parsed.pathname)) {
        if (fail) return new Response("unavailable", { status: 503 });
        return new Response(detail("batting", [batting({ 打数: "1", 安打: "1" })]));
      }
      if (parsed.pathname.endsWith("/game")) return new Response(list);
      return new Response(annualHtml("batting", parsed.searchParams.get("search_result[unreached]") === "true"));
    } };
  return { loader: () => createTeamsOneBattersLoader(options), urls, advance: milliseconds => { time += milliseconds; }, fail: () => { fail = true; } };
}

test("recent mode coalesces requests, shares cached totals, and never contaminates annual results", async () => {
  const state = setup(), load = state.loader();
  const snapshots = await Promise.all(Array.from({ length: 20 }, () => load(request + "&recent5=true")));
  assert.equal(state.urls.length, 7);
  assert.equal(value(snapshots[0], "試合数"), "5");
  assert.ok(snapshots.every(table => table.season === "直近5試合" && table.recentGames.length === 5));
  await state.loader()(request + "&recent5=true");
  assert.equal(state.urls.length, 7);
  const annual = await load(request);
  assert.equal(annual.season, "2026");
  assert.equal(state.urls.length, 8);
  assert.equal(annual.recentGames, undefined);
});

test("a missing game on refresh preserves the complete previous recent snapshot with retry backoff", async () => {
  const state = setup(), load = state.loader();
  const original = await load(request + "&recent5=true");state.advance(15 * 60 * 1000);state.fail();
  const stale = await load(request + "&recent5=true");
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.rows, original.rows);
  assert.deepEqual(stale.recentGames, original.recentGames);
  const calls = state.urls.length;
  await load(request + "&recent5=true");await state.loader()(request + "&recent5=true");
  assert.equal(state.urls.length, calls);
});
