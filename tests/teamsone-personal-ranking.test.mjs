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
const { personalMetricLeaderboard, personalMetricRank, personalMetricRequiresQualification, PERSONAL_BATTING_METRICS, PERSONAL_PITCHING_METRICS } = await import(await moduleUrl(resolve(project, "lib/teamsone-personal.ts")));
const { teamsOneColumns } = await import(await moduleUrl(resolve(project, "lib/teamsone-batters.ts")));
const player = (number, value, column = "本塁打", kind = "batting") => ({
  id: `player-${number}`, number: String(number), name: `選手${number}`,
  values: teamsOneColumns(kind).map(key => key === column ? value : "0"),
});

test("second place sees only the gap to first; first place sees no gaps", () => {
  const rows = [player(1, "8"), player(2, "5"), player(3, "2")];
  const board = personalMetricLeaderboard(rows, rows[1], "本塁打");
  assert.deepEqual(board.leaders.map(row => row.gap), ["あと3本", undefined, undefined]);
  assert.deepEqual(board.leaders.map(row => row.isSelf), [false, true, false]);
  assert.equal(board.personal, undefined);
  assert.equal(board.eligible, true);
  assert.ok(personalMetricLeaderboard(rows, rows[0], "本塁打").leaders.every(row => row.gap === undefined));
});

test("a qualified member outside the top three is shown beneath them with gaps to all three", () => {
  const rows = [player(9, "20", "打点"), player(3, "10", "打点"), player(5, "5", "打点"), player(1, "0", "打点")];
  const board = personalMetricLeaderboard(rows, rows[3], "打点");
  assert.deepEqual(board.leaders.map(row => row.gap), ["あと20点", "あと10点", "あと5点"]);
  assert.equal(board.personal.player.id, rows[3].id);
  assert.equal(board.personal.rank, 4);
  assert.equal(board.personal.gap, undefined);
  assert.equal(board.eligible, true);
});

test("ties prioritize the member, then numeric jersey order; only three people appear", () => {
  const rows = [player(20, "8"), player(10, "5"), player(2, "5"), player(99, "5"), player(1, "5")];
  const before = JSON.stringify(rows);
  const board = personalMetricLeaderboard(rows, rows[3], "本塁打");
  assert.deepEqual(board.leaders.map(row => row.player.number), ["20", "99", "1"]);
  assert.deepEqual(board.leaders.map(row => row.rank), [1, 2, 2]);
  assert.equal(board.personal, undefined);
  assert.deepEqual(board.leaders.map(row => row.gap), ["あと3本", undefined, undefined]);
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(personalMetricLeaderboard(rows, undefined, "本塁打").leaders.map(row => row.player.number), ["20", "1", "2"]);
});

test("a tie for third puts the member first in the tie even with the largest jersey number", () => {
  const rows = [player(1, "12"), player(2, "10"), player(3, "5"), player(99, "5")];
  const board = personalMetricLeaderboard(rows, rows[3], "本塁打");
  assert.deepEqual(board.leaders.map(row => row.player.number), ["1", "2", "99"]);
  assert.deepEqual(board.leaders.map(row => row.rank), [1, 2, 3]);
  assert.equal(board.personal, undefined);
});

test("players outside the selected pool appear below three leaders without gaps", () => {
  const rows = [player(1, "3"), player(2, "2"), player(3, "1")];
  for (const value of ["0", "2", "100"]) {
    const self = player(99, value);
    const board = personalMetricLeaderboard(rows, self, "本塁打");
    assert.deepEqual(board.leaders.map(row => row.player.number), ["1", "2", "3"]);
    assert.ok(board.leaders.every(row => !row.isSelf && row.gap === undefined));
    assert.equal(board.personal.player, self);
    assert.equal(board.personal.rank, undefined);
    assert.equal(board.eligible, false);
  }
});

test("rates have precise differences without floating point artifacts", () => {
  const rows = [player(1, ".350", "打率"), player(2, ".300", "打率"), player(3, ".200", "打率")];
  assert.deepEqual(personalMetricLeaderboard(rows, rows[2], "打率").leaders.map(row => row.gap), ["あと0.150", "あと0.100", undefined]);
});

test("ERA ranks ascending including zero, with positive gaps in the correct direction", () => {
  const rows = [player(1, "3.25", "防御率", "pitching"), player(2, "0.00", "防御率", "pitching"), player(3, "2.50", "防御率", "pitching")];
  const board = personalMetricLeaderboard(rows, rows[0], "防御率", "pitching");
  assert.deepEqual(board.leaders.map(row => row.player.number), ["2", "3", "1"]);
  assert.deepEqual(board.leaders.map(row => row.gap), ["あと3.25", "あと0.75", undefined]);
});

test("innings gaps use fractional outs rather than decimal innings", () => {
  const rows = [player(1, "12回2/3", "投球回", "pitching"), player(2, "10回1/3", "投球回", "pitching"), player(3, "10回0/3", "投球回", "pitching")];
  assert.deepEqual(personalMetricLeaderboard(rows, rows[2], "投球回", "pitching").leaders.map(row => row.gap), ["あと2回2/3", "あと0回1/3", undefined]);
});

test("missing values do not rank and missing members never get fabricated gaps", () => {
  const rows = [player(1, "—"), player(2, "0"), player(3, "-"), player(4, "2")];
  const board = personalMetricLeaderboard(rows, rows[0], "本塁打");
  assert.deepEqual(board.leaders.map(row => row.player.number), ["4", "2"]);
  assert.ok(board.leaders.every(row => row.gap === undefined));
  assert.equal(board.eligible, true);
  assert.equal(board.personal.rank, undefined);
  assert.equal(personalMetricLeaderboard(rows, undefined, "本塁打").personal, undefined);
  assert.equal(personalMetricLeaderboard([], rows[0], "本塁打").leaders.length, 0);
});

test("qualified published values are used consistently when the all-player snapshot differs", () => {
  const rows = [player(1, "8"), player(2, "5"), player(3, "2")];
  const board = personalMetricLeaderboard(rows, { ...rows[1], values: player(2, "9").values }, "本塁打");
  assert.equal(board.leaders[1].player.values[5], "5");
  assert.equal(board.leaders[0].gap, "あと3本");
});

test("zero ties fill three rows without changing the existing crown exclusion", () => {
  const rows = [player(10, "0"), player(2, "0"), player(1, "0"), player(99, "0")];
  const board = personalMetricLeaderboard(rows, rows[3], "本塁打");
  assert.deepEqual(board.leaders.map(row => row.player.number), ["99", "1", "2"]);
  assert.deepEqual(board.leaders.map(row => row.rank), [1, 1, 1]);
  assert.ok(board.leaders.every(row => row.gap === undefined));
  assert.equal(personalMetricRank(rows, rows[3], "本塁打"), undefined);
});

test("only the requested five batting and two pitching metrics require qualification", () => {
  for (const [kind, metrics, required] of [
    ["batting", PERSONAL_BATTING_METRICS, ["打率", "出塁率", "長打率", "得点圏打率", "OPS"]],
    ["pitching", PERSONAL_PITCHING_METRICS, ["勝率", "防御率"]],
  ]) {
    assert.deepEqual(metrics.filter(([column]) => personalMetricRequiresQualification(column, kind)).map(([column]) => column), required);
  }
  assert.equal(personalMetricRequiresQualification("得点圏打率"), true);
});

test("every unrestricted metric includes an unqualified member for crowns and leaderboards", () => {
  for (const [kind, metrics] of [["batting", PERSONAL_BATTING_METRICS], ["pitching", PERSONAL_PITCHING_METRICS]]) {
    for (const [column] of metrics) {
      const qualified = [player(1, "10", column, kind), player(2, "8", column, kind), player(3, "5", column, kind)];
      const self = player(99, "20", column, kind);
      const all = [...qualified, self];
      const restricted = personalMetricRequiresQualification(column, kind);
      const pool = restricted ? qualified : all;
      const board = personalMetricLeaderboard(pool, self, column, kind);
      assert.equal(personalMetricRank(pool, self, column, kind), restricted ? undefined : 1, `${kind}:${column} crown`);
      assert.equal(board.eligible, !restricted, `${kind}:${column} eligibility`);
      if (restricted) {
        assert.equal(board.personal.player.id, self.id);
        assert.ok(board.leaders.every(row => !row.isSelf && row.gap === undefined));
      } else {
        assert.equal(board.leaders[0].player.id, self.id, `${kind}:${column} first`);
        assert.equal(board.personal, undefined);
        const zero = player(99, "0", column, kind);
        assert.equal(personalMetricRank([...qualified, zero], zero, column, kind), undefined, `${kind}:${column} zero crown`);
      }
    }
  }
});

test("unqualified players outside the top three get their rank and gaps in unrestricted metrics", () => {
  for (const [kind, column] of [["batting", "本塁打"], ["batting", "盗塁"], ["pitching", "奪三振"], ["pitching", "投球回"]]) {
    const rows = [player(1, "10", column, kind), player(2, "8", column, kind), player(3, "5", column, kind), player(99, "1", column, kind)];
    const board = personalMetricLeaderboard(rows, rows[3], column, kind);
    assert.equal(board.eligible, true);
    assert.equal(board.personal.rank, 4);
    assert.ok(board.leaders.every(row => row.gap), `${kind}:${column} gaps`);
  }
});

test("unqualified competitors can overtake a qualified member for unrestricted crowns", () => {
  for (const [kind, column] of [["batting", "本塁打"], ["pitching", "勝"]]) {
    const self = player(1, "10", column, kind);
    const qualified = [self, player(2, "8", column, kind)];
    const all = [...qualified, player(99, "20", column, kind)];
    assert.equal(personalMetricRank(qualified, self, column, kind), 1);
    assert.equal(personalMetricRank(all, self, column, kind), 2);
    assert.equal(personalMetricLeaderboard(all, self, column, kind).leaders[0].gap, column === "本塁打" ? "あと10本" : "あと10");
  }
});
