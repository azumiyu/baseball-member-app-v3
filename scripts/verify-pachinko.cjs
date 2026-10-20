/* Deterministic, isolated local game regression. No DB, browser, or network. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS verifier. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
let passed = 0;
function test(name, run) {
  run();
  passed += 1;
  console.log(`PASS ${name}`);
}
function loadTs(filename, globals = {}, imports = {}) {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: filename,
    reportDiagnostics: true,
  });
  assert.equal(code.diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error).length, 0);
  const tsModule = { exports: {} };
  vm.runInNewContext(code.outputText, {
    module: tsModule, exports: tsModule.exports,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    ...globals,
  }, { filename });
  return tsModule.exports;
}
const game = loadTs("components/pachi/pachinko-game.ts");
const physics = loadTs("components/pachi/pachinko-physics.ts");

class Clock {
  now = 0;
  serial = 0;
  tasks = new Map();
  setTimeout = (callback, delay) => {
    const id = ++this.serial;
    this.tasks.set(id, { at: this.now + Math.max(0, delay), callback });
    return id;
  };
  clearTimeout = (id) => this.tasks.delete(id);
  next() {
    let selected;
    for (const [id, task] of this.tasks) {
      if (!selected || task.at < selected.task.at || (task.at === selected.task.at && id < selected.id)) selected = { id, task };
    }
    return selected;
  }
  advance(ms) {
    const destination = this.now + ms;
    let iterations = 0;
    while (this.next()?.task.at <= destination) {
      assert.ok(++iterations < 100000, "timer runaway");
      const { id, task } = this.next();
      this.now = task.at;
      this.tasks.delete(id);
      task.callback();
    }
    this.now = destination;
  }
  until(predicate, maxMs = 120000) {
    const deadline = this.now + maxMs;
    let iterations = 0;
    while (!predicate()) {
      assert.ok(++iterations < 20000, "predicate timer runaway");
      const next = this.next();
      assert.ok(next && next.task.at <= deadline, "condition did not complete before deadline");
      this.advance(next.task.at - this.now);
    }
  }
}

function machine({ randomValue = 0.99, target = "out", duration = 10, realPhysics = false } = {}) {
  const clock = new Clock();
  const listeners = new Set();
  const document = {
    visibilityState: "visible",
    addEventListener: (name, listener) => { assert.equal(name, "visibilitychange"); listeners.add(listener); },
    removeEventListener: (name, listener) => listeners.delete(listener),
  };
  const options = { ready: true, reducedMotion: false };
  const physical = { target, duration };
  let random = randomValue;
  let queue = [];
  let view;
  let changes = 0;
  let maxFlights = 0;
  const api = loadTs("components/pachi/pachinko-controller.ts", {
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    Date: { now: () => clock.now }, document,
  }, {
    "./pachinko-game": game,
    "./pachinko-physics": realPhysics ? physics : {
      createBallFlight: () => ({ target: physical.target, durationMs: physical.duration,
        points: [{ x: 0, y: 0 }, { x: 300, y: 510 }], lane: "left", bounces: 3 }),
    },
  });
  const controller = api.createPachinkoController((next) => {
    view = next; changes += 1; maxFlights = Math.max(maxFlights, next.balls.length);
    assert.ok(next.holds.length <= game.HOLD_CAPACITY);
    assert.ok(next.balls.length <= game.MAX_BALLS_IN_FLIGHT);
    assert.ok(next.ballsOwned >= 0);
  }, () => options, () => queue.length ? queue.shift() : typeof random === "function" ? random() : random);
  controller.refresh();
  return {
    controller, clock, options, physical, document, listeners,
    get view() { return view; }, get changes() { return changes; }, get maxFlights() { return maxFlights; },
    random: (value) => { random = value; }, randomQueue: (...values) => { queue.push(...values); },
    visibility: (value) => { document.visibilityState = value; for (const listener of [...listeners]) listener(); },
    ball(nextTarget = physical.target) {
      physical.target = nextTarget;
      if (!view.canLaunch) clock.until(() => view.canLaunch, 60000);
      const before = view.totalLaunched;
      controller.launchBall();
      assert.equal(view.totalLaunched, before + 1);
      clock.advance(physical.duration);
    },
    bonus() { clock.until(() => view.phase === "bonus"); },
    drainBonus() {
      const before = view.gameId;
      let count = 0;
      while (view.phase === "bonus" && view.gameId === before) {
        assert.ok(++count < 150, "bonus did not finish");
        if (!view.attackerOpen) { clock.advance(game.TIMINGS.bonusRound); continue; }
        this.ball("attacker");
      }
    },
  };
}

test("exact normal/RUSH odds; heat cannot amplify probability", () => {
  assert.equal(game.JACKPOT_RATE, 1 / 99.9);
  assert.equal(game.RUSH_JACKPOT_RATE, 1 / 39.9);
  for (const heat of ["normal", "chance", "hot"]) assert.equal(game.jackpotRate(heat), 1 / 99.9);
  assert.equal(game.jackpotRate("rush"), 1 / 39.9);
  const a = game.createGamePlan("normal", () => 0.015);
  const b = game.createGamePlan("hot", () => 0.015);
  assert.equal(a.win, false);
  assert.equal(b.win, false);
});

test("ticket keeps a single draw and deterministic presentation across mode changes", () => {
  const ticket = { draw: 0.015, presentationSeed: 124 };
  const normal = game.planForTicket(ticket, "normal");
  const rush = game.planForTicket(ticket, "rush");
  assert.equal(normal.win, false);
  assert.equal(rush.win, true);
  assert.equal(JSON.stringify(normal), JSON.stringify(game.planForTicket(ticket, "normal")));
  assert.equal(ticket.draw, 0.015);
});

test("sample odds, RUSH entry, reach/symbol consistency, and heat correlation", () => {
  const counts = { normal: 0, rush: 0, rushEntry: 0, hotWin: 0, hotLose: 0 };
  let seed = 523927;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  const size = 180000;
  for (let i = 0; i < size; i += 1) {
    const plan = game.createGamePlan("normal", rng);
    counts.normal += Number(plan.win);
    counts.rushEntry += Number(plan.rushEntry);
    counts.hotWin += Number(plan.win && plan.heat === "hot");
    counts.hotLose += Number(!plan.win && plan.heat === "hot");
    if (plan.win) assert.ok(plan.reach);
    assert.equal(plan.finalSymbols.every((symbol) => symbol === plan.finalSymbols[0]), plan.win);
    if (!plan.reach) assert.notEqual(plan.finalSymbols[0], plan.finalSymbols[2]);
    if (plan.win && plan.finalSymbols[0] === 7) assert.ok(plan.rushEntry);
    counts.rush += Number(game.createGamePlan("rush", rng).win);
  }
  assert.ok(Math.abs(counts.normal / size - game.JACKPOT_RATE) < 0.001);
  assert.ok(Math.abs(counts.rush / size - game.RUSH_JACKPOT_RATE) < 0.0015);
  assert.ok(Math.abs(counts.rushEntry / counts.normal - 0.5) < 0.05);
  assert.ok(counts.hotWin / counts.normal > 0.5);
  assert.ok(counts.hotLose / (size - counts.normal) < 0.004);
});

test("600 ms launch cadence, stock cost, and synchronous double-input guard", () => {
  const h = machine({ duration: 1000 });
  h.controller.launchBall(); h.controller.launchBall();
  assert.equal(h.view.totalLaunched, 1);
  h.controller.setFiring(true);
  h.clock.advance(5999);
  assert.equal(h.view.totalLaunched, 10);
  h.clock.advance(1);
  assert.equal(h.view.totalLaunched, 11);
  assert.equal(h.view.ballsOwned, 2489);
  h.controller.setFiring(false);
  h.clock.advance(5000);
  assert.equal(h.view.totalLaunched, 11);
  h.controller.dispose();
});

test("zero stock stops firing and free refill adds exactly 2500 balls", () => {
  const h = machine();
  h.controller.setFiring(true);
  h.clock.advance(600 * 2501);
  assert.equal(h.view.totalLaunched, 2500);
  assert.equal(h.view.ballsOwned, 0);
  assert.equal(h.view.firing, false);
  h.controller.launchBall();
  assert.equal(h.view.totalLaunched, 2500);
  h.controller.refill();
  assert.equal(h.view.ballsOwned, 2500);
  assert.equal(h.view.firing, false);
  h.controller.dispose();
});

test("many simultaneous balls stay bounded without forbidding a full hold queue", () => {
  const h = machine({ duration: 60000 });
  h.controller.setFiring(true);
  h.clock.advance(59999);
  assert.equal(h.view.totalLaunched, game.MAX_BALLS_IN_FLIGHT);
  assert.equal(h.maxFlights, game.MAX_BALLS_IN_FLIGHT);
  h.controller.setFiring(false);
  h.controller.dispose();
});

test("start payout occurs at arrival; four holds are FIFO and overflow still pays", () => {
  const h = machine({ randomValue: 0, target: "start", duration: 10 });
  h.controller.launchBall();
  assert.equal(h.view.totalPayout, 0);
  h.clock.advance(9);
  assert.equal(h.view.entryId, 0);
  h.clock.advance(1);
  assert.equal(h.view.entryId, 1);
  assert.equal(h.view.totalPayout, 3);
  assert.equal(h.view.ballsOwned, 2502);
  for (let i = 0; i < 7; i += 1) h.ball("start");
  assert.equal(h.view.totalLaunched, 8);
  assert.equal(h.view.entryId, 5);
  assert.equal(h.view.holds.length, 4);
  assert.equal(Array.from(h.view.holds, (hold) => hold.id).join(","), "2,3,4,5");
  assert.equal(h.view.totalPayout, 24);
  h.controller.dispose();
});

test("normal prize pays five; closed attacker does not pay", () => {
  const h = machine();
  h.ball("prize");
  assert.equal(h.view.totalPayout, 5);
  h.ball("attacker");
  assert.equal(h.view.totalPayout, 5);
  assert.equal(h.view.ballsOwned, 2503);
  h.controller.dispose();
});

test("bonus cannot auto-complete: only actual attacker arrivals pay and advance rounds", () => {
  const h = machine({ randomValue: 0, target: "start" });
  h.ball(); h.bonus();
  assert.equal(h.view.bonusRoundsTotal, 5);
  h.clock.advance(60000);
  assert.equal(h.view.phase, "bonus");
  assert.equal(h.view.bonusRound, 1);
  assert.equal(h.view.bonusHits, 0);
  assert.equal(h.view.totalPayout, 3);
  h.controller.setPower(88);
  h.ball("attacker");
  assert.equal(h.view.bonusHits, 1);
  assert.equal(h.view.totalPayout, 18);
  for (let i = 0; i < 9; i += 1) h.ball("attacker");
  assert.equal(h.view.bonusHits, 10);
  assert.equal(h.view.attackerOpen, false);
  assert.equal(h.view.totalPayout, 153);
  h.clock.advance(600);
  h.ball("attacker");
  assert.equal(h.view.totalPayout, 153, "arrivals during intermission cannot pay");
  h.clock.advance(200);
  assert.equal(h.view.bonusRound, 2);
  h.drainBonus();
  assert.equal(h.view.phase, "idle");
  assert.equal(h.view.totalPayout, 753);
  assert.equal(h.view.mode, "rush");
  assert.equal(h.view.rushRemaining, 50);
  assert.equal(h.view.chain, 1);
  h.controller.dispose();
});

test("RUSH hit gives 10 rounds / 1500 payout, resets ST 50, and increments chain", () => {
  const h = machine({ randomValue: 0, target: "start" });
  h.ball(); h.bonus(); h.drainBonus();
  const before = h.view.totalPayout;
  h.ball("start"); h.bonus();
  assert.equal(h.view.bonusRoundsTotal, 10);
  assert.equal(h.view.chain, 2);
  h.drainBonus();
  assert.equal(h.view.totalPayout - before, 1503);
  assert.equal(h.view.rushRemaining, 50);
  assert.equal(h.view.maxChain, 2);
  h.controller.dispose();
});

test("normal hit without RUSH entry returns to normal after five rounds", () => {
  let seed = 0;
  while (game.planForTicket({ draw: 0, presentationSeed: seed }, "normal").rushEntry) seed += 1;
  const h = machine({ target: "start" });
  h.randomQueue(0, seed / 0x100000000);
  h.ball(); h.bonus();
  assert.equal(h.view.rushEntry, false);
  h.drainBonus();
  assert.equal(h.view.mode, "normal");
  assert.equal(h.view.rushRemaining, 0);
  assert.equal(h.view.chain, 0);
  h.controller.dispose();
});

test("ST decrements only when a losing variation finishes and expires after exactly 50", () => {
  const h = machine({ randomValue: 0, target: "start" });
  h.ball(); h.bonus(); h.drainBonus();
  h.random(0.99);
  for (let i = 0; i < 50; i += 1) {
    h.ball("start");
    assert.equal(h.view.rushRemaining, 50 - i);
    h.clock.until(() => h.view.phase === "idle");
    assert.equal(h.view.rushRemaining, 49 - i);
    assert.equal(h.view.mode, i === 49 ? "normal" : "rush");
  }
  assert.equal(h.view.chain, 0);
  assert.equal(h.view.maxChain, 1);
  h.controller.dispose();
});

test("queued normal ticket uses consumption mode after RUSH entry, with no redraw", () => {
  const h = machine({ randomValue: 0, target: "start" });
  h.ball();
  h.random(0.015);
  h.ball("start");
  const ticket = h.view.holds[0].ticket;
  assert.equal(ticket.draw, 0.015);
  assert.equal(game.planForTicket(ticket, "normal").win, false);
  assert.equal(game.planForTicket(ticket, "rush").win, true);
  h.bonus(); h.drainBonus();
  assert.equal(h.view.gameId, 2);
  assert.equal(h.view.mode, "rush");
  h.bonus();
  assert.equal(h.view.jackpots, 2);
  assert.equal(h.view.bonusRoundsTotal, 10);
  h.controller.dispose();
});

test("PUSH reveals the preselected result once, even after randomness changes", () => {
  const h = machine({ randomValue: 0, target: "start" });
  h.ball();
  h.clock.until(() => h.view.phase === "push");
  h.random(0.99);
  h.controller.push(); h.controller.push(); h.controller.push();
  assert.equal(h.view.phase, "freeze");
  h.clock.advance(game.TIMINGS.freeze);
  assert.equal(h.view.jackpots, 1);
  assert.equal(h.view.completed, 1);
  h.clock.advance(game.TIMINGS.pushTimeout + 1000);
  assert.equal(h.view.jackpots, 1);
  h.controller.dispose();
});

test("unpressed PUSH auto-reveals the same result", () => {
  const h = machine({ randomValue: 0, target: "start" });
  h.ball();
  h.clock.until(() => h.view.phase === "push");
  h.clock.advance(game.TIMINGS.pushTimeout + game.TIMINGS.freeze);
  assert.equal(h.view.phase, "jackpot");
  assert.equal(h.view.jackpots, 1);
  h.controller.dispose();
});

test("revival is presentation of one win, with no duplicate completed count", () => {
  let seed = 0;
  while (!game.planForTicket({ draw: 0, presentationSeed: seed }, "normal").revival) seed += 1;
  const h = machine({ target: "start" });
  h.randomQueue(0, seed / 0x100000000);
  h.ball();
  h.clock.until(() => h.view.phase === "miss");
  assert.equal(h.view.completed, 0);
  h.clock.until(() => h.view.phase === "revival");
  assert.equal(h.view.revived, true);
  h.clock.until(() => h.view.phase === "jackpot");
  assert.equal(h.view.completed, 1);
  assert.equal(h.view.jackpots, 1);
  h.controller.dispose();
});

test("manual pause preserves remaining flight time and rejects input", () => {
  const h = machine({ target: "start", duration: 1000 });
  h.controller.launchBall();
  h.clock.advance(300);
  h.controller.setPaused(true);
  h.controller.launchBall();
  h.clock.advance(10000);
  assert.equal(h.view.entryId, 0);
  assert.equal(h.view.totalLaunched, 1);
  assert.equal(h.view.paused, true);
  h.controller.setPaused(false);
  h.clock.advance(699);
  assert.equal(h.view.entryId, 0);
  h.clock.advance(1);
  assert.equal(h.view.entryId, 1);
  h.controller.dispose();
});

test("visibility pause and manual pause compose without resuming timers early", () => {
  const h = machine({ target: "start", duration: 1000 });
  h.controller.launchBall(); h.clock.advance(200);
  h.visibility("hidden"); h.controller.setPaused(true);
  h.clock.advance(5000);
  h.visibility("visible");
  assert.equal(h.view.paused, true);
  h.clock.advance(5000);
  assert.equal(h.view.entryId, 0);
  h.controller.setPaused(false);
  h.clock.advance(799);
  assert.equal(h.view.entryId, 0);
  h.clock.advance(1);
  assert.equal(h.view.entryId, 1);
  h.controller.dispose();
});

test("preview is isolated, blocks firing/refill, and restores balls/stats/RUSH", () => {
  const h = machine();
  h.ball("out"); h.clock.advance(600);
  const saved = h.view;
  assert.equal(saved.canPreview, true);
  h.controller.previewJackpot();
  assert.equal(h.view.preview, true);
  h.controller.setFiring(true); h.controller.launchBall(); h.controller.refill();
  assert.equal(h.view.totalLaunched, saved.totalLaunched);
  h.clock.until(() => h.view.phase === "push");
  h.controller.push();
  h.clock.until(() => !h.view.preview);
  for (const key of ["ballsOwned", "totalPayout", "totalLaunched", "completed", "jackpots", "mode", "rushRemaining", "chain", "maxChain"]) assert.equal(h.view[key], saved[key], key);
  assert.equal(h.view.firing, false);
  assert.equal(h.view.phase, "idle");
  h.controller.dispose();
});

test("preview cannot interrupt a ball in flight, a hold, or active firing", () => {
  const h = machine({ duration: 1000 });
  h.controller.setFiring(true);
  h.controller.previewJackpot();
  assert.equal(h.view.preview, false);
  h.controller.setFiring(false);
  h.controller.previewJackpot();
  assert.equal(h.view.preview, false);
  h.controller.dispose();
  const q = machine({ randomValue: 0, target: "start" });
  q.ball(); q.ball();
  q.controller.previewJackpot();
  assert.equal(q.view.preview, false);
  assert.equal(q.view.holds.length, 1);
  q.controller.dispose();
});

test("power clamps finite values and ready/reduced-motion options cannot change results", () => {
  const h = machine({ target: "start", duration: 1000, randomValue: 0 });
  h.controller.setPower(-10); assert.equal(h.view.power, 0);
  h.controller.setPower(101); assert.equal(h.view.power, 100);
  h.controller.setPower(NaN); assert.equal(h.view.power, 100);
  h.options.ready = false; h.controller.refresh(); h.controller.launchBall();
  assert.equal(h.view.totalLaunched, 0);
  h.options.ready = true; h.options.reducedMotion = true; h.controller.refresh();
  h.controller.launchBall(); h.clock.advance(999);
  assert.equal(h.view.entryId, 0, "reduced motion must not alter the actual flight/arrival");
  h.clock.advance(1); h.options.reducedMotion = false; h.controller.refresh();
  h.bonus(); assert.equal(h.view.jackpots, 1);
  h.controller.dispose();
});

test("dispose removes all timers/listeners and makes callbacks and methods inert", () => {
  const h = machine({ target: "start", duration: 1000 });
  h.controller.setFiring(true);
  assert.ok(h.clock.tasks.size > 0);
  h.controller.dispose();
  const before = h.changes;
  assert.equal(h.clock.tasks.size, 0);
  assert.equal(h.listeners.size, 0);
  h.controller.launchBall(); h.controller.push(); h.controller.refill();
  h.controller.setPower(80); h.controller.refresh(); h.controller.setPaused(false);
  h.controller.previewJackpot(); h.clock.advance(100000);
  assert.equal(h.changes, before);
});

test("seeded controller + real physics: long session, real bonuses, pause, depletion/refill", () => {
  let seed = 0x5eed1234;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  const h = machine({ randomValue: rng, realPhysics: true });
  const seen = new Set();
  let bonusArrivals = 0;
  let previousHits = 0;
  let previousRound = 0;
  let previousGame = 0;
  function check() {
    seen.add(h.view.mode);
    seen.add(h.view.phase);
    assert.ok(h.view.balls.length <= game.MAX_BALLS_IN_FLIGHT);
    assert.ok(h.view.holds.length <= game.HOLD_CAPACITY);
    assert.ok(h.view.ballsOwned >= 0);
    assert.ok(h.view.rushRemaining >= 0 && h.view.rushRemaining <= game.RUSH_SPINS);
    assert.ok(h.view.bonusHits >= 0 && h.view.bonusHits <= game.BONUS_HITS_PER_ROUND);
    if (h.view.phase === "bonus") {
      const sameRound = previousRound === h.view.bonusRound && previousGame === h.view.gameId;
      bonusArrivals += sameRound ? Math.max(0, h.view.bonusHits - previousHits) : h.view.bonusHits;
      previousHits = h.view.bonusHits;
      previousRound = h.view.bonusRound;
      previousGame = h.view.gameId;
    }
  }
  h.controller.setFiring(true);
  for (let elapsed = 0; elapsed < 10 * 60 * 1000; elapsed += 200) {
    h.controller.setPower(h.view.mode === "rush" || h.view.phase === "bonus" ? 88 : 56);
    if (h.view.phase === "push") h.controller.push();
    if (elapsed === 120000) {
      h.controller.setPaused(true);
      const frozen = JSON.stringify(h.view);
      h.clock.advance(30000);
      assert.equal(JSON.stringify(h.view), frozen, "all real flights/rounds freeze together");
      h.controller.setPaused(false);
    }
    h.clock.advance(200);
    check();
  }
  assert.ok(seen.has("normal"));
  assert.ok(seen.has("bonus"), "seed must exercise a real jackpot");
  assert.ok(seen.has("rush"), "seed must exercise RUSH");
  assert.ok(bonusArrivals >= 50, "a real five-round bonus must complete via attacker balls");
  assert.ok(h.view.totalLaunched >= 900);
  assert.ok(h.view.totalPayout >= 750);
  console.log(`  Real 10-minute session: ${h.view.totalLaunched} shots, ${h.view.jackpots} jackpots, ${h.view.totalPayout} payout, max ${h.maxFlights} simultaneous balls.`);
  h.controller.dispose();
  assert.equal(h.clock.tasks.size, 0);
  // Ten minutes is only 1000 shots and the successful session can build a
  // large tray. In a fresh seeded real machine, weak shots deplete the
  // original 2500 balls without changing any controller state directly.
  const empty = machine({ randomValue: rng, realPhysics: true });
  empty.controller.setPower(0);
  empty.controller.setFiring(true);
  const depletionDeadline = 70 * 60 * 1000;
  while (empty.view.ballsOwned > 0 || empty.view.balls.length > 0) {
    assert.ok(empty.clock.now < depletionDeadline, "real stock did not run out");
    if (!empty.view.firing && empty.view.ballsOwned > 0) empty.controller.setFiring(true);
    if (empty.view.phase === "push") empty.controller.push();
    empty.clock.advance(600);
  }
  assert.equal(empty.view.firing, false);
  const shots = empty.view.totalLaunched;
  empty.clock.advance(6000);
  assert.equal(empty.view.totalLaunched, shots);
  empty.controller.refill();
  assert.equal(empty.view.ballsOwned, 2500);
  empty.controller.setPower(empty.view.mode === "rush" || empty.view.phase === "bonus" ? 88 : 56);
  empty.controller.setFiring(true);
  empty.clock.advance(6000);
  assert.ok(empty.view.totalLaunched > shots);
  empty.controller.dispose();
  assert.equal(empty.clock.tasks.size, 0);
});

console.log(`\n${passed} pachinko regression checks passed.`);
