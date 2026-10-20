/* eslint-disable @typescript-eslint/no-require-imports -- Standalone deterministic regression. */
// `--print-matrix` regenerates the small lookup table after intentional balance changes.
// The browser only reads that table; these simulation runs never execute during play.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const entry = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const localRequire = (name) => {
    if (name.startsWith("./")) return load(path.posix.normalize(`${path.posix.dirname(file)}/${name.slice(2)}.ts`));
    throw Error(`Unexpected module ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(localRequire, entry, entry.exports);
  cache.set(file, entry.exports);
  return entry.exports;
}
const { ROYALE_CARDS, ROYALE_DEFAULT_DECK } = load("lib/games/yg-royale-cards.ts");
const { createRoyale, advanceRoyale } = load("lib/games/yg-royale.ts");

function formation(card, side, startId, centerY) {
  const positions = card.count === 1 ? [[0, 0]] : card.count === 3 ? [[-17, -9], [17, -9], [0, 17]] : [[-17, -14], [17, -14], [-17, 14], [17, 14]];
  return positions.map(([x, y], index) => ({
    id: startId + index, cardId: card.id, side, x: 300 + x, y: centerY + y,
    hp: card.hp, maxHp: card.hp, cooldown: 6, spawnTick: 0, hitUntil: 0,
    attackUntil: 0, slowUntil: 0, walkTicks: 0, shield: card.trait === "shield" ? 320 : 0,
    hitCount: 0, damageScale: 1,
  }));
}
function duel(own, enemy) {
  let state = { ...createRoyale(1, 0, ROYALE_DEFAULT_DECK),
    units: [...formation(own, "player", 1, 690), ...formation(enemy, "enemy", 10, 550)],
    nextId: 20, nextSpawnTick: 1_000_000, towerCooldown: 1_000_000,
  };
  for (let tick = 5; tick <= 1200; tick += 5) {
    state = advanceRoyale(state, [], tick);
    const ownUnits = state.units.filter((unit) => unit.side === "player");
    const enemyUnits = state.units.filter((unit) => unit.side === "enemy");
    if (!ownUnits.length || !enemyUnits.length) {
      const surviving = (units, card) => units.reduce((total, unit) => total + Math.max(0, unit.hp) + unit.shield, 0) / ((card.hp + (card.trait === "shield" ? 320 : 0)) * card.count);
      if (!enemyUnits.length && surviving(ownUnits, own) >= .15) return "strong";
      if (!ownUnits.length && surviving(enemyUnits, enemy) >= .15) return "weak";
      return "even";
    }
  }
  return "even";
}
const reverse = (relation) => relation === "strong" ? "weak" : relation === "weak" ? "strong" : "even";
const matrix = ROYALE_CARDS.map(() => ROYALE_CARDS.map(() => "even"));
for (let i = 0; i < ROYALE_CARDS.length; i++) for (let j = i + 1; j < ROYALE_CARDS.length; j++) {
  const forward = duel(ROYALE_CARDS[i], ROYALE_CARDS[j]);
  const backward = reverse(duel(ROYALE_CARDS[j], ROYALE_CARDS[i]));
  // If the first target or deployment side changes the result, call it even.
  matrix[i][j] = forward === backward ? forward : "even";
  matrix[j][i] = reverse(matrix[i][j]);
}
if (process.argv.includes("--print-matrix")) {
  const code = { strong: "+", weak: "-", even: "=" };
  for (let i = 0; i < matrix.length; i++) console.log(`  "${matrix[i].map((value) => code[value]).join("")}", // ${ROYALE_CARDS[i].id}`);
  process.exit(0);
}
const { royaleMatchup, royaleMatchups } = load("lib/games/yg-royale-matchups.ts");
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
check("all 289 stored matchups reproduce real combat with equal-level, one-card formations", () => {
  for (let i = 0; i < ROYALE_CARDS.length; i++) for (let j = 0; j < ROYALE_CARDS.length; j++) {
    assert.equal(royaleMatchup(ROYALE_CARDS[i].id, ROYALE_CARDS[j].id).relation, matrix[i][j], `${ROYALE_CARDS[i].id} vs ${ROYALE_CARDS[j].id}`);
  }
});
check("flying units counter melee ground-only units, while the reverse is unfavorable", () => {
  assert.equal(royaleMatchup("kan-bats", "mega-chiaki").relation, "strong");
  assert.equal(royaleMatchup("mega-chiaki", "kan-bats").relation, "weak");
  assert.match(royaleMatchup("kan-bats", "mega-chiaki").reason, /空|飛/);
});
check("wide-area defenders counter ground and flying swarms", () => {
  assert.equal(royaleMatchup("yamaki-bomber", "kawataka-squad").relation, "strong");
  assert.equal(royaleMatchup("oshino-wizard", "kan-bats").relation, "strong");
  assert.match(royaleMatchup("yamaki-bomber", "kawataka-squad").reason, /範囲/);
});
check("every card has reciprocal comparisons and useful readable reasons", () => {
  for (const own of ROYALE_CARDS) for (const enemy of ROYALE_CARDS) {
    const result = royaleMatchup(own.id, enemy.id);
    assert.ok(result.reason.length > 5);
    assert.equal(royaleMatchup(enemy.id, own.id).relation, reverse(result.relation));
    if (own.id === enemy.id) assert.equal(result.relation, "even");
  }
});
check("per-character strong and weak lists include only matching opponents once", () => {
  for (const card of ROYALE_CARDS) {
    const result = royaleMatchups(card.id);
    const ids = [...result.strong, ...result.weak].map((entry) => entry.card.id);
    assert.equal(ids.length, new Set(ids).size);
    assert.ok(!ids.includes(card.id));
    for (const relation of ["strong", "weak"]) for (const entry of result[relation]) {
      assert.equal(royaleMatchup(card.id, entry.card.id).relation, relation);
      assert.equal(entry.reason, royaleMatchup(card.id, entry.card.id).reason);
    }
  }
});
check("lookup queries reject unknown characters and perform no runtime battle simulation", () => {
  assert.throws(() => royaleMatchup("unknown", "mega-chiaki"));
  assert.throws(() => royaleMatchups("unknown"));
  const source = fs.readFileSync(path.join(root, "lib/games/yg-royale-matchups.ts"), "utf8");
  assert.doesNotMatch(source, /advanceRoyale|createRoyale|fetch\(/);
});
console.log(`\n${checks} matchup checks passed (289 battle comparisons).`);
