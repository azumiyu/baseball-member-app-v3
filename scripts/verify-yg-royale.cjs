/* Local deterministic simulation checks. No browser, worker, database or network. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
function load(filename, imports = {}) {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  const result = ts.transpileModule(source, { fileName: filename, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  assert.equal(result.diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
  const tsModule = { exports: {} };
  const execute = vm.runInThisContext(`(function(module, exports, require) { ${result.outputText}\n})`, { filename });
  execute(tsModule, tsModule.exports, (name) => {
    assert.ok(name in imports, `Unexpected import ${name}`); return imports[name];
  });
  return tsModule.exports;
}
const cards = load("lib/games/yg-royale-cards.ts");
const engine = load("lib/games/yg-royale.ts", { "./yg-royale-cards": cards });
const { ROYALE, createRoyale, advanceRoyale, royaleCanDeploy, royaleDifficulty, validateRoyaleDeck, validateRoyaleInputs } = engine;
const { ROYALE_CARDS, ROYALE_DEFAULT_DECK, royaleCard, royaleKillPoints } = cards;
const normalized = (value) => JSON.parse(JSON.stringify(value));
function unit(id, cardId, side, x, y, patch = {}) {
  const card = royaleCard(cardId);
  return { id, cardId, side, x, y, hp: card.hp, maxHp: card.hp, cooldown: 0,
    spawnTick: 0, hitUntil: 0, attackUntil: 0, slowUntil: 0, walkTicks: 0,
    shield: card.trait === "shield" ? 320 : 0, hitCount: 0, damageScale: 1, ...patch };
}
function fixture(units) {
  return { ...createRoyale(12), units, nextId: 100, nextSpawnTick: 1e9, towerCooldown: 10000 };
}
function advanceLong(state, ticks) {
  const destination = state.tick + ticks;
  while (state.tick < destination && state.status === "playing") state = advanceRoyale(state, [], Math.min(destination, state.tick + ROYALE.maxChunkTicks));
  return state;
}

test("17 original portrait cards exist, unique ids and usable stats", () => {
  assert.equal(ROYALE_CARDS.length, 17);
  assert.equal(new Set(ROYALE_CARDS.map((card) => card.id)).size, 17);
  for (const card of ROYALE_CARDS) {
    assert.ok(fs.existsSync(path.join(root, "public", card.image)));
    assert.ok(card.cost >= 1 && card.cost <= 10 && card.count >= 1 && card.hp > 0 && card.damage > 0);
    assert.ok(Number.isSafeInteger(card.killPoints) && card.killPoints > 0);
    assert.equal(royaleKillPoints(card.id), card.killPoints);
  }
  assert.equal(royaleCard("ramen-negishi").imageScale, 2);
  assert.ok(ROYALE_CARDS.some((card) => card.air));
  assert.ok(ROYALE_CARDS.every((card) => ["ground", "both"].includes(card.targets)));
  assert.ok(royaleKillPoints("mega-chiaki") > royaleKillPoints("kawataka-squad") * 4);
  assert.ok(royaleKillPoints("horie-golem") > royaleKillPoints("ishihata-spirits") * 3);
});
test("defense version has no enemy king and never accepts old-damage state", () => {
  const state = createRoyale(1);
  assert.equal(ROYALE.gameId, "yg-clash-royale-defense");
  assert.equal(state.version, 2);
  assert.equal(ROYALE.enemyTower, undefined);
  assert.equal(state.enemyTowerCooldown, undefined);
  assert.throws(() => advanceRoyale({ ...state, version: 1 }, [], 1));
  const renamed = {
    "goto-sinker": "ゴトウシンカー", "kitazawa-archer": "北澤クロスファイヤー",
    "ikehara-giant": "池原神パンツジャイアント", "yamaki-bomber": "八巻社長激務",
    "kawanabe-knight": "川鍋タイワン", "misawa-dragon": "三澤ローボールドラゴン",
    "oshino-wizard": "押野先生シラフ", "shibata-dodger": "芝田バスターエンドラン",
  };
  for (const [id, name] of Object.entries(renamed)) assert.equal(royaleCard(id).name, name);
});
test("eight unique cards, trusted timestamps and seeds are validated", () => {
  assert.deepEqual(normalized(validateRoyaleDeck(ROYALE_DEFAULT_DECK)), normalized(ROYALE_DEFAULT_DECK));
  for (const bad of [null, [], Array(8).fill("mega-chiaki"), [...ROYALE_DEFAULT_DECK.slice(0, 7), "fake"]]) assert.throws(() => validateRoyaleDeck(bad));
  for (const seed of [-1, 2 ** 32, NaN, 0.5]) assert.throws(() => createRoyale(seed));
  for (const at of [-1, NaN, 0.5]) assert.throws(() => createRoyale(1, at));
});
test("four hand / four queue rotate and elixir is charged exactly once", () => {
  const state = createRoyale(123, 100);
  const before = JSON.stringify(state);
  const result = advanceRoyale(state, [{ tick: 1, slot: 0, x: 165, y: 650 }], 1);
  assert.equal(JSON.stringify(state), before, "source state was mutated");
  assert.equal(result.hand[0], ROYALE_DEFAULT_DECK[4]);
  assert.equal(result.queue[3], "mega-chiaki");
  assert.equal(result.hand.length, 4); assert.equal(result.queue.length, 4);
  assert.equal(result.deployments, 1); assert.equal(result.units[0].cardId, "mega-chiaki");
  assert.ok(Math.abs(result.elixir - 0.04) < 1e-8);
});
test("malformed, duplicate, out-of-bounds and unaffordable inputs reject atomically", () => {
  const state = createRoyale(4);
  const before = JSON.stringify(state);
  const input = { tick: 1, slot: 0, x: 165, y: 650 };
  for (const bad of [null, [null], [{ ...input, tick: 0 }], [input, input], [{ ...input, slot: 4 }], [{ ...input, x: NaN }], [{ ...input, y: 499 }], [{ ...input, y: 761 }], [{ ...input, x: 31 }], [{ ...input, x: 33.3 }]]) assert.throws(() => validateRoyaleInputs(bad));
  for (const tick of [0, 201, NaN, 1.5]) assert.throws(() => advanceRoyale(state, [], tick));
  assert.throws(() => advanceRoyale(state, [{ ...input, tick: 2 }], 1));
  assert.throws(() => advanceRoyale(state, [input, { ...input, tick: 2, slot: 1 }], 2));
  assert.equal(JSON.stringify(state), before);
});
test("chunk size and checkpoint serialization never change the result", () => {
  const original = createRoyale(0xabcd);
  const inputs = [{ tick: 1, slot: 2, x: 165, y: 520 }, { tick: 90, slot: 1, x: 435, y: 610 }, { tick: 190, slot: 3, x: 165, y: 700 }];
  const expected = advanceRoyale(original, inputs, 200);
  let actual = original;
  for (let tick = 1; tick <= 200; tick++) actual = advanceRoyale(normalized(actual), inputs.filter((input) => input.tick === tick), tick);
  assert.deepEqual(normalized(actual), normalized(expected));
  assert.deepEqual(normalized(advanceRoyale(original, inputs, 200)), normalized(expected));
});
test("ground units route across either bridge and never walk through the river", () => {
  let state = fixture([unit(1, "kawanabe-knight", "player", 300, 520)]);
  let crossed = false;
  for (let i = 0; i < 180; i++) {
    state = advanceRoyale(state, [], state.tick + 1);
    const actor = state.units[0];
    if (actor.y > ROYALE.riverTop && actor.y < ROYALE.riverBottom) {
      crossed = true;
      assert.ok(ROYALE.bridges.some((x) => Math.abs(actor.x - x) < ROYALE.bridgeHalfWidth));
    }
  }
  assert.ok(crossed);
});
test("flying units cross water directly and cannot be hit by ground-only attackers", () => {
  let state = fixture([unit(1, "kan-bats", "player", 300, 520), unit(2, "kan-bats", "enemy", 300, 130, { cooldown: 999 })]);
  state = advanceLong(state, 40);
  assert.ok(state.units[0].y < ROYALE.riverTop && Math.abs(state.units[0].x - 300) < 1);
  state = fixture([unit(1, "mega-chiaki", "player", 165, 650), unit(2, "kan-bats", "enemy", 165, 620, { cooldown: 999 })]);
  state = advanceRoyale(state, [], 1);
  assert.equal(state.units.find((actor) => actor.id === 2).hp, royaleCard("kan-bats").hp);
  state = fixture([unit(1, "kitazawa-archer", "player", 165, 650), unit(2, "kan-bats", "enemy", 165, 620, { cooldown: 999 })]);
  state = advanceRoyale(state, [], 1);
  assert.equal(state.units.find((actor) => actor.id === 2).hp, 5);
});
test("area damage counters swarms while a single hit damages just one target", () => {
  const enemies = [150, 175, 200].map((x, i) => unit(i + 2, "kawataka-squad", "enemy", x, 650, { cooldown: 999 }));
  const bomb = advanceRoyale(fixture([unit(1, "yamaki-bomber", "player", 175, 700), ...enemies]), [], 1);
  assert.equal(bomb.units.filter((actor) => actor.side === "enemy" && actor.hp === 45).length, 3);
  const prince = advanceRoyale(fixture([unit(1, "ramen-negishi", "player", 175, 685), ...enemies]), [], 1);
  assert.equal(prince.units.filter((actor) => actor.side === "enemy").length, 2);
});
test("former siege cards intercept enemies and never score from an empty arena", () => {
  for (const id of ["ikehara-giant", "kobayashi-runner", "horie-golem"]) {
    const original = fixture([unit(1, id, "player", 165, 155), unit(2, "kawanabe-knight", "enemy", 165, 135, { cooldown: 999 })]);
    const result = advanceRoyale(original, [], 1);
    assert.equal(result.score, 0, "ordinary damage must not award points");
    assert.equal(result.units.find((actor) => actor.id === 2).hp, royaleCard("kawanabe-knight").hp - royaleCard(id).damage);
    const waiting = advanceLong(fixture([unit(1, id, "player", 165, 120)]), 200);
    assert.equal(waiting.score, 0); assert.equal(waiting.kills, 0);
    assert.equal(waiting.units[0].attackUntil, 0);
    assert.ok(waiting.units[0].y > 120 && waiting.units[0].y <= 255);
    assert.ok(!JSON.stringify(waiting).includes("null"), "Infinity must not leak through JSON");
  }
});
test("each defeated enemy pays exactly its own bounty; living enemies and allied deaths pay zero", () => {
  for (const card of ROYALE_CARDS) {
    const result = advanceRoyale(fixture([unit(1, "kitazawa-archer", "player", 165, 700), unit(2, card.id, "enemy", 165, 650, { hp: 1, shield: 0, cooldown: 999 })]), [], 1);
    assert.equal(result.score, card.killPoints, card.id); assert.equal(result.kills, 1, card.id);
    assert.equal(result.effects.find((entry) => entry.kind === "death" && entry.side === "enemy").amount, card.killPoints);
  }
  const lost = advanceRoyale(fixture([unit(1, "kitazawa-archer", "enemy", 165, 700), unit(2, "kawanabe-knight", "player", 165, 650, { hp: 1, cooldown: 999 })]), [], 1);
  assert.equal(lost.score, 0); assert.equal(lost.kills, 0);
});
test("simultaneous overkill pays once and self-tower kills count even on the loss tick", () => {
  const overkill = advanceRoyale(fixture([unit(1, "kitazawa-archer", "player", 150, 700), unit(2, "kitazawa-archer", "player", 180, 700), unit(3, "kawataka-squad", "enemy", 165, 650, { hp: 1, cooldown: 999 })]), [], 1);
  assert.equal(overkill.score, royaleKillPoints("kawataka-squad")); assert.equal(overkill.kills, 1);
  const state = fixture([unit(1, "ramen-negishi", "enemy", 300, 770, { hp: 1 })]);
  state.playerHp = 1; state.towerCooldown = 0;
  const last = advanceRoyale(state, [], 200);
  assert.equal(last.status, "finished"); assert.equal(last.tick, 1);
  assert.equal(last.score, royaleKillPoints("ramen-negishi")); assert.equal(last.kills, 1);
  assert.equal(advanceRoyale(last, [], 200).score, last.score);
});
test("charge doubles a hit, slow persists and shields absorb before health", () => {
  const duel = (walkTicks) => advanceRoyale(fixture([unit(1, "ramen-negishi", "player", 165, 650, { walkTicks }), unit(2, "ikehara-giant", "enemy", 165, 620, { cooldown: 999 })]), [], 1);
  assert.equal(duel(0).units.find((actor) => actor.id === 2).hp - duel(30).units.find((actor) => actor.id === 2).hp, 225);
  const slowed = advanceRoyale(fixture([unit(1, "goto-sinker", "player", 165, 700), unit(2, "abe-guardian", "enemy", 165, 650, { cooldown: 999 })]), [], 1);
  const shield = slowed.units.find((actor) => actor.id === 2);
  assert.equal(shield.hp, 500); assert.equal(shield.shield, 237); assert.equal(shield.slowUntil, 26);
});
test("third unit strike is dodged and golem death blast has actual damage", () => {
  const dodged = advanceRoyale(fixture([unit(1, "kawanabe-knight", "player", 165, 650), unit(2, "shibata-dodger", "enemy", 165, 620, { cooldown: 999, hitCount: 2 })]), [], 1);
  assert.equal(dodged.units.find((actor) => actor.id === 2).hp, 350);
  assert.ok(dodged.effects.some((entry) => entry.kind === "dodge"));
  const death = advanceRoyale(fixture([unit(1, "kawanabe-knight", "player", 165, 650), unit(2, "horie-golem", "enemy", 165, 620, { hp: 1, cooldown: 999 })]), [], 1);
  assert.equal(death.units.find((actor) => actor.id === 1).hp, 930 - 180);
  assert.equal(death.kills, 1);
});
test("loss stops at the exact lethal tick and later commands reject", () => {
  const state = fixture([unit(1, "ramen-negishi", "enemy", 300, 770)]);
  state.playerHp = 1;
  const result = advanceRoyale(state, [], 200);
  assert.equal(result.tick, 1); assert.equal(result.status, "finished"); assert.equal(result.playerHp, 0);
  assert.equal(result.damageTaken, 1);
  assert.throws(() => advanceRoyale(state, [{ tick: 2, slot: 0, x: 165, y: 650 }], 200));
  assert.throws(() => advanceRoyale(result, [{ tick: 2, slot: 0, x: 165, y: 650 }], 2));
  assert.equal(advanceRoyale(result, [], 200).tick, 1);
});
test("increasing pressure, faster elixir and bounded populations/effects", () => {
  const start = royaleDifficulty(0), late = royaleDifficulty(6000), extreme = royaleDifficulty(12000);
  assert.ok(late.spawnEveryTicks < start.spawnEveryTicks && late.batch > start.batch);
  assert.ok(extreme.damageMultiplier > late.damageMultiplier && extreme.healthMultiplier > late.healthMultiplier);
  assert.ok(late.elixirPerSecond > start.elixirPerSecond);
  let state = createRoyale(123);
  state.tick = 6000; state.nextSpawnTick = 6001;
  state.units = Array.from({ length: 48 }, (_, i) => unit(i + 1, "ikehara-giant", "enemy", 100 + i % 20, 130));
  const result = advanceRoyale(state, [], 6200);
  assert.equal(result.units.length, 48);
  assert.ok(result.units.every((actor) => actor.damageScale > 1 && actor.maxHp > royaleCard(actor.cardId).hp));
  assert.ok(result.effects.length <= ROYALE.maxEffects);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 32000);
});
test("full 96-unit battlefield stays bounded, JSON-safe and rejects further deployment", () => {
  const state = fixture(Array.from({ length: 96 }, (_, i) => unit(i + 1, i % 3 === 0 ? "kan-bats" : "kawanabe-knight",
    i < 48 ? "player" : "enemy", 80 + (i % 12) * 40, i < 48 ? 620 : 240, { cooldown: 10000 })));
  state.elixir = 10;
  assert.equal(royaleCanDeploy(state, 0, 165, 650), false);
  assert.throws(() => advanceRoyale(state, [{ tick: 1, slot: 0, x: 165, y: 650 }], 1));
  const began = performance.now();
  const result = advanceRoyale(state, [], 200);
  const elapsed = performance.now() - began;
  assert.ok(result.units.length <= ROYALE.maxUnits && result.effects.length <= ROYALE.maxEffects);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 32000);
  assert.ok(result.units.every((actor) => Number.isFinite(actor.x) && Number.isFinite(actor.y) && Number.isFinite(actor.hp)));
  console.log("BOUNDED_CHUNK", JSON.stringify({ units: result.units.length, ticks: 200, ms: Math.round(elapsed), bytes: Buffer.byteLength(JSON.stringify(result)) }));
});

function runBot(seed, smart) {
  let state = createRoyale(seed);
  const inputs = [];
  let maxUnits = 0;
  let maxBytes = 0;
  while (state.status === "playing" && state.tick < 9000) {
    const options = [];
    if (state.tick % 10 === 0) {
      const threats = state.units.filter((actor) => actor.side === "enemy" && actor.y > 410);
      const threat = threats.sort((a, b) => b.y - a.y)[0];
      for (let slot = 0; slot < 4; slot++) {
        const card = royaleCard(state.hand[slot]);
        const x = threat ? (threat.x < 300 ? 165 : 435) : (Math.floor(state.tick / 200) % 2 ? 435 : 165);
        const y = threat ? 680 : 515;
        if (!royaleCanDeploy(state, slot, x, y)) continue;
        let priority = -card.cost;
        if (smart) {
          priority = !threat && card.hp > 1000 ? 4 : 0;
          if (threat) {
            const airborne = threats.filter((actor) => royaleCard(actor.cardId).air).length;
            priority += airborne ? (card.targets === "both" ? 10 : -20) : card.splash > 0 && threats.length >= 3 ? 12 : card.hp / 500;
          }
        }
        options.push({ slot, x, y, priority });
      }
    }
    options.sort((a, b) => b.priority - a.priority);
    const input = options[0] ? [{ tick: state.tick + 1, slot: options[0].slot, x: options[0].x, y: options[0].y }] : [];
    if (input.length) inputs.push(input[0]);
    state = advanceRoyale(state, input, state.tick + 1);
    maxUnits = Math.max(maxUnits, state.units.length);
    if (state.tick % 200 === 0) maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(state)));
    assert.ok(state.units.length <= ROYALE.maxUnits && state.effects.length <= ROYALE.maxEffects);
    assert.ok(state.elixir >= 0 && state.elixir <= 10 && Number.isSafeInteger(state.score));
  }
  return { state, inputs, maxUnits, maxBytes };
}
test("seeded matches score, terminate under the final rush and replay exactly", () => {
  const results = [];
  for (const seed of [7, 103, 773]) {
    const run = runBot(seed, true);
    assert.equal(run.state.status, "finished", "escalating army must eventually overwhelm a legal defense");
    assert.ok(run.state.score > 0 && run.state.deployments > 5);
    assert.ok(run.maxBytes < 32000);
    let replay = createRoyale(seed);
    while (replay.status === "playing") {
      const toTick = Math.min(run.state.tick, replay.tick + ROYALE.maxChunkTicks);
      replay = advanceRoyale(replay, run.inputs.filter((input) => input.tick > replay.tick && input.tick <= toTick), toTick);
    }
    assert.deepEqual(normalized(replay), normalized(run.state));
    results.push({ seed, seconds: run.state.tick / 20, score: run.state.score, deployed: run.state.deployments, maxUnits: run.maxUnits, maxBytes: run.maxBytes });
  }
  console.log("MATCHES", JSON.stringify(results));
});
test("counter-aware choices produce a different battle from a cheap-card rush", () => {
  const smart = runBot(103, true);
  const blind = runBot(103, false);
  assert.notEqual(smart.state.score, blind.state.score);
  console.log("TACTICS", JSON.stringify({ counter: { seconds: smart.state.tick / 20, score: smart.state.score }, cheap: { seconds: blind.state.tick / 20, score: blind.state.score } }));
});
console.log(`${passed} YG Royale simulation checks passed.`);
