/* Hook lifecycle + authoritative replay checks; no browser/network/database. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const json = (value) => JSON.parse(JSON.stringify(value));
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
function load(filename, imports = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, filename), "utf8");
  const output = ts.transpileModule(source, { fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const tsModule = { exports: {} };
  vm.runInNewContext(output.outputText, { module: tsModule, exports: tsModule.exports, require: (name) => {
    assert.ok(name in imports, `Unexpected import ${name}`); return imports[name];
  }, ...globals }, { filename });
  return tsModule.exports;
}
const cards = load("lib/games/yg-royale-cards.ts");
const engine = load("lib/games/yg-royale.ts", { "./yg-royale-cards": cards });

function harness(initial = () => engine.createRoyale(7)) {
  let now = 0, frameId = 0, timerId = 0, entityId = 0, index = 0, dirty = false, mounted = true, hook;
  let server = null, turn = 0, currentRun = null, delivery = "ok", writesAfterUnmount = 0;
  const frames = new Map(), timers = new Map(), documentEvents = new Map(), windowEvents = new Map(), slots = [], calls = [], deliveries = [], cache = new Map();
  const document = { hidden: false, addEventListener: (name, callback) => documentEvents.set(name, callback),
    removeEventListener: (name, callback) => { if (documentEvents.get(name) === callback) documentEvents.delete(name); } };
  const window = { addEventListener: (name, callback) => windowEvents.set(name, callback),
    removeEventListener: (name, callback) => { if (windowEvents.get(name) === callback) windowEvents.delete(name); } };
  const depsEqual = (a, b) => a !== undefined && b !== undefined && a.length === b.length && a.every((entry, i) => Object.is(entry, b[i]));
  const react = {
    useState: (value) => {
      const i = index++;
      if (!slots[i]) slots[i] = { value: typeof value === "function" ? value() : value };
      const set = (next) => {
        if (!mounted) { writesAfterUnmount++; return; }
        const value = typeof next === "function" ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      };
      return [slots[i].value, set];
    },
    useRef: (value) => { const i = index++; if (!slots[i]) slots[i] = { value: { current: value } }; return slots[i].value; },
    useCallback: (callback, deps) => {
      const i = index++;
      if (!slots[i] || !depsEqual(slots[i].deps, deps)) slots[i] = { deps, value: callback };
      return slots[i].value;
    },
    useEffect: (callback, deps) => {
      const i = index++;
      if (!slots[i]) slots[i] = { effect: true, deps: undefined, cleanup: null };
      const slot = slots[i];
      slot.callback = callback;
      if (!depsEqual(slot.deps, deps)) { slot.pending = true; slot.deps = deps; }
    },
  };
  function snapshot() {
    return { game: { id: engine.ROYALE.gameId }, run: server ? { id: currentRun, turn, status: server.status, lastResult: json(server) } : null, ranking: [] };
  }
  function execute(action) {
    if (cache.has(action.requestId)) return json(cache.get(action.requestId));
    if (action.action === "start") { server = initial(); currentRun = `run-${entityId}`; turn = 1; }
    else {
      assert.equal(action.runId, currentRun); assert.equal(action.turn, turn);
      server = engine.advanceRoyale(server, action.inputs, action.toTick); turn++;
    }
    const result = snapshot(); cache.set(action.requestId, result); return json(result);
  }
  const api = {
    snapshot: null, loading: false, busy: false, retryPending: false, error: "", unauthorized: false,
    read: async () => { api.snapshot = snapshot(); dirty = true; return api.snapshot; },
    act: async (action) => {
      if (api.busy) return null;
      calls.push(action); api.busy = true; dirty = true;
      const mode = delivery;
      let result;
      if (mode === "hold") result = await new Promise((resolve) => deliveries.push({ action, resolve }));
      else if (mode === "lose") { execute(action); result = null; }
      else if (mode === "fail") result = null;
      else if (mode === "unauthorized") { api.unauthorized = true; result = null; }
      else result = execute(action);
      api.busy = false; api.retryPending = !result;
      if (result) api.snapshot = result;
      dirty = true;
      return result;
    },
  };
  const hookModule = load("components/games/useYgRoyaleGame.ts", {
    react, "@/lib/entity-id": { createEntityId: () => `request-${++entityId}` },
    "@/lib/games/yg-royale": engine, "./useGameApi": { useGameApi: () => api },
  }, { document, window, performance: { now: () => now },
    requestAnimationFrame: (callback) => { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id) });
  function pump() {
    if (!mounted) return;
    let iterations = 0;
    do {
      assert.ok(iterations++ < 50, "hook rerender loop");
      dirty = false; index = 0; hook = hookModule.useYgRoyaleGame();
      for (const slot of slots) if (slot?.effect && slot.pending) {
        slot.pending = false; slot.cleanup?.(); slot.cleanup = slot.callback() ?? null;
      }
    } while (dirty);
  }
  async function settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) pump(); } }
  function frame(ms = 50) {
    now += ms;
    for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= now && timers.has(id)) { timers.delete(id); timer.callback(); }
    }
    if (dirty) pump();
    const callbacks = [...frames.values()]; frames.clear();
    for (const callback of callbacks) callback(now);
    if (dirty) pump();
  }
  function advance(ms) { for (let remainder = ms; remainder > 0; remainder -= Math.min(50, remainder)) frame(Math.min(50, remainder)); }
  async function start() { const pending = hook.start(cards.ROYALE_DEFAULT_DECK); pump(); await pending; await settle(); }
  function unmount() { mounted = false; for (const slot of slots) if (slot?.effect) slot.cleanup?.(); }
  function deliver(transform) {
    assert.ok(deliveries.length, "no pending API call");
    const held = deliveries.shift();
    const result = execute(held.action);
    if (transform) transform(result);
    held.resolve(result);
  }
  pump();
  return { api, calls, frames, timers, documentEvents, windowEvents, document, start, pump, settle, frame, advance, unmount, deliver,
    get value() { return hook; }, get server() { return server; }, get writesAfterUnmount() { return writesAfterUnmount; },
    set delivery(value) { delivery = value; },
    strictReplay() { for (const slot of slots) if (slot?.effect) slot.cleanup?.(); for (const slot of slots) if (slot?.effect) slot.cleanup = slot.callback() ?? null; },
    hide() { document.hidden = true; documentEvents.get("visibilitychange")?.(); pump(); },
    show() { document.hidden = false; documentEvents.get("visibilitychange")?.(); pump(); },
    pagehide() { windowEvents.get("pagehide")?.(); pump(); },
    pageshow() { windowEvents.get("pageshow")?.(); pump(); },
  };
}

(async () => {
  await test("mount/StrictMode replay own one listener pair and no unsolicited simulation", async () => {
    const h = harness(); h.strictReplay(); h.pump();
    assert.equal(h.documentEvents.size, 1); assert.equal(h.windowEvents.size, 2);
    assert.equal(h.frames.size, 0); assert.equal(h.calls.length, 0); assert.equal(h.value.state, null);
    h.unmount(); assert.equal(h.documentEvents.size, 0); assert.equal(h.windowEvents.size, 0);
  });
  await test("one queued deployment lands on the next 50ms tick and rotates the real hand", async () => {
    const h = harness(); await h.start();
    assert.equal(h.frames.size, 1); assert.equal(h.value.playing, true);
    assert.equal(h.value.deploy(0, 165.4, 650.4), true);
    assert.equal(h.value.deploy(1, 435, 650), false); h.pump();
    assert.ok(h.value.inputNotice);
    h.frame(49); assert.equal(h.value.state.tick, 0);
    h.frame(1); assert.equal(h.value.state.tick, 1);
    assert.equal(h.value.state.deployments, 1); assert.equal(h.value.state.hand[0], "kitazawa-archer");
    assert.equal(h.calls.length, 1); h.unmount();
  });
  await test("10 seconds of frames make one checkpoint and authoritative state exactly matches prediction", async () => {
    const h = harness(); await h.start();
    h.value.deploy(2, 165, 515); h.advance(10000); await h.settle();
    assert.equal(h.calls.length, 2); assert.equal(h.calls[1].toTick, 200);
    assert.equal(h.calls[1].inputs.length, 1);
    assert.deepEqual(json(h.value.state), json(h.server));
    assert.equal(h.value.awaitingSave, false); assert.equal(h.value.playing, true); h.unmount();
  });
  await test("pause flushes a partial checkpoint, discards queued commands and resume drops hidden elapsed time", async () => {
    const h = harness(); await h.start(); h.advance(850);
    h.value.deploy(2, 165, 650); h.value.pause(); h.pump(); await h.settle();
    assert.equal(h.calls[1].toTick, 17); assert.equal(h.calls[1].inputs.length, 0);
    assert.equal(h.value.playing, false); h.advance(60000); assert.equal(h.value.state.tick, 17);
    h.value.resume(); h.pump(); h.frame(50);
    assert.equal(h.value.state.tick, 18); assert.equal(h.value.state.deployments, 0); h.unmount();
  });
  await test("a brief WebView visibility change preserves play without a save or pause", async () => {
    const h = harness(); await h.start(); h.advance(500); h.hide(); h.advance(100);
    assert.equal(h.value.playing, true); assert.equal(h.value.state.tick, 10);
    h.show(); h.frame(50); await h.settle();
    assert.equal(h.value.playing, true); assert.equal(h.value.state.tick, 11);
    assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0); h.unmount();
  });
  await test("a sustained hidden page pauses and saves once, then resumes without hidden elapsed time", async () => {
    const h = harness(); await h.start(); h.advance(500); h.hide(); h.advance(200); await h.settle();
    assert.equal(h.value.playing, false); assert.equal(h.calls.length, 2);
    h.advance(10000); assert.equal(h.value.state.tick, 10); assert.equal(h.frames.size, 0);
    h.show(); h.frame(50); assert.equal(h.value.playing, true); assert.equal(h.value.state.tick, 11); h.unmount();
  });
  await test("pagehide saves immediately and BFCache pageshow resumes an automatic pause", async () => {
    const h = harness(); await h.start(); h.advance(500); h.pagehide(); await h.settle();
    assert.equal(h.value.playing, false); assert.equal(h.calls.length, 2);
    h.advance(10000); assert.equal(h.value.state.tick, 10);
    h.pageshow(); h.frame(50); assert.equal(h.value.playing, true); assert.equal(h.value.state.tick, 11); h.unmount();
  });
  await test("manual pauses remain paused through visibility and pageshow events", async () => {
    const h = harness(); await h.start(); h.advance(500); h.value.pause(); h.pump(); await h.settle();
    h.hide(); h.advance(1000); h.show(); h.pageshow(); h.advance(1000);
    assert.equal(h.value.playing, false); assert.equal(h.value.state.tick, 10);
    assert.equal(h.calls.length, 2); h.unmount();
  });
  await test("slow checkpoints cap prediction at 400 ticks and drain in ordered chunks", async () => {
    const h = harness(); await h.start(); h.delivery = "hold";
    h.advance(30000); assert.equal(h.value.state.tick, 400); assert.equal(h.calls.length, 2);
    assert.equal(h.value.awaitingSave, true);
    h.deliver(); await h.settle();
    assert.equal(h.calls.length, 3); assert.equal(h.calls[2].toTick, 400); assert.equal(h.calls[2].turn, 2);
    h.deliver(); await h.settle();
    assert.deepEqual(json(h.value.state), json(h.server)); assert.equal(h.value.awaitingSave, false); h.unmount();
  });
  await test("a committed but lost response retries the same request id while prediction continues", async () => {
    const h = harness(); await h.start(); h.delivery = "lose";
    h.value.deploy(2, 165, 515); h.advance(10000); await h.settle();
    assert.equal(h.value.playing, true); assert.ok(h.value.notice.includes("再試行"));
    assert.equal(h.value.awaitingSave, true);
    const request = json(h.calls[1]); h.advance(500); assert.equal(h.value.state.tick, 210);
    h.delivery = "ok"; h.advance(500); await h.settle();
    assert.deepEqual(json(h.calls[2]), request); assert.equal(h.server.deployments, 1);
    assert.deepEqual(json(h.value.state), json(engine.advanceRoyale(h.server, [], 220)));
    assert.equal(h.value.playing, true); assert.equal(h.value.hasSession, true);
    assert.equal(h.value.awaitingSave, false); assert.equal(h.value.notice, ""); h.unmount();
  });
  await test("retries back off at 1, 2 and 4 seconds, cap prediction and recover automatically", async () => {
    const h = harness(); await h.start(); h.delivery = "fail";
    h.advance(10000); await h.settle(); assert.equal(h.calls.length, 2);
    h.advance(950); await h.settle(); assert.equal(h.calls.length, 2);
    h.advance(50); await h.settle(); assert.equal(h.calls.length, 3);
    h.advance(1950); await h.settle(); assert.equal(h.calls.length, 3);
    h.advance(50); await h.settle(); assert.equal(h.calls.length, 4);
    assert.ok(h.value.notice.includes("不安定"));
    h.advance(3950); await h.settle(); assert.equal(h.calls.length, 4);
    h.advance(50); await h.settle(); assert.equal(h.calls.length, 5);
    h.advance(10000); await h.settle(); assert.equal(h.value.state.tick, 400);
    assert.equal(h.value.playing, true); assert.ok(h.value.notice.includes("保存待ち"));
    assert.ok(h.calls.slice(1).every(call => call.requestId === h.calls[1].requestId));
    h.delivery = "ok"; await h.value.retry(); await h.settle();
    assert.deepEqual(json(h.value.state), json(h.server)); assert.equal(h.timers.size, 0);
    h.frame(50); assert.equal(h.value.state.tick, 401); h.unmount();
  });
  await test("hidden pages cancel retry timers and resume pending saves on visibility restoration", async () => {
    const h = harness(); await h.start(); h.delivery = "fail"; h.advance(10000); await h.settle();
    assert.equal(h.timers.size, 1); h.hide(); h.advance(200); await h.settle();
    assert.equal(h.value.playing, false); assert.equal(h.timers.size, 0);
    h.advance(10000); await h.settle(); assert.equal(h.calls.length, 2);
    h.delivery = "ok"; h.show(); assert.equal(h.value.playing, true); h.advance(1000); await h.settle();
    assert.equal(h.calls.length, 3); assert.equal(h.value.hasSession, true); h.unmount();
  });
  await test("a lost partial hidden checkpoint keeps its original expectation after automatic resume", async () => {
    const h = harness(); await h.start(); h.advance(850); h.delivery = "lose";
    h.hide(); h.advance(200); await h.settle();
    assert.equal(h.calls[1].toTick, 17); assert.equal(h.server.tick, 17);
    h.delivery = "ok"; h.show(); h.advance(1000); await h.settle();
    assert.deepEqual(json(h.calls[2]), json(h.calls[1]));
    assert.equal(h.value.state.tick, 37); assert.equal(h.value.playing, true);
    assert.equal(h.value.hasSession, true); assert.equal(h.value.awaitingSave, false);
    assert.deepEqual(json(h.value.state), json(engine.advanceRoyale(h.server, [], 37))); h.unmount();
  });
  await test("successful background retry never resumes a manually paused battle", async () => {
    const h = harness(); await h.start(); h.advance(850); h.delivery = "fail";
    h.value.pause(); h.pump(); await h.settle();
    assert.equal(h.value.playing, false); assert.equal(h.value.awaitingSave, true);
    h.delivery = "ok"; h.advance(1000); await h.settle();
    assert.equal(h.value.playing, false); assert.equal(h.value.awaitingSave, false);
    assert.equal(h.value.state.tick, 17); assert.equal(h.calls.length, 3);
    h.hide(); h.advance(1000); h.show(); h.advance(1000);
    assert.equal(h.value.playing, false); assert.equal(h.calls.length, 3); h.unmount();
  });
  await test("same checkpoint with reordered keys and rounded fractional coordinates keeps playing and rebases", async () => {
    const h = harness(); await h.start(); h.delivery = "hold";
    h.value.deploy(2, 165, 515); h.advance(10500);
    let confirmed;
    h.deliver(reply => {
      const prior = json(reply.run.lastResult);
      const reordered = Object.fromEntries(Object.entries(reply.run.lastResult).reverse());
      reordered.elixir += 1e-12;
      if (reordered.units[0]) reordered.units[0].x += 1e-12;
      reply.run.lastResult = reordered;
      assert.notEqual(JSON.stringify(reply.run.lastResult), JSON.stringify(prior), "old stringify guard would pause");
      confirmed = json(reordered);
    });
    await h.settle();
    assert.equal(h.value.playing, true); assert.equal(h.value.hasSession, true);
    assert.equal(h.value.state.tick, 210);
    assert.deepEqual(json(h.value.state), json(engine.advanceRoyale(confirmed, [], 210))); h.unmount();
  });
  await test("integer counters stay exact and meaningful fractional conflicts still stop safely", async () => {
    for (const [field, difference] of [["score", 1e-12], ["elixir", 0.001]]) {
      const h = harness(); await h.start(); h.delivery = "hold"; h.advance(10000);
      h.deliver(reply => { reply.run.lastResult[field] += difference; }); await h.settle();
      assert.equal(h.value.playing, false); assert.equal(h.value.hasSession, false);
      assert.ok(h.value.notice.includes("保存されたバトル")); h.unmount();
    }
  });
  await test("authorization failure stops the battle and never schedules anonymous retries", async () => {
    const h = harness(); await h.start(); h.delivery = "unauthorized";
    h.advance(10000); await h.settle();
    assert.equal(h.value.playing, false); assert.equal(h.timers.size, 0);
    h.hide(); h.advance(1000); h.show(); h.advance(10000);
    assert.equal(h.value.playing, false); assert.equal(h.calls.length, 2); h.unmount();
  });
  await test("a conflicting authoritative snapshot is adopted and can be resumed", async () => {
    const h = harness(); await h.start(); h.delivery = "hold"; h.advance(10000);
    h.deliver((reply) => { reply.run.lastResult.score += 1; }); await h.settle();
    assert.equal(h.value.playing, false); assert.equal(h.value.hasSession, false);
    assert.ok(h.value.notice.includes("保存された")); assert.equal(h.value.state.score, 1);
    h.value.resume(); h.pump(); assert.equal(h.value.playing, true); assert.equal(h.value.state.score, 1); h.unmount();
  });
  await test("unmount cancels RAF/listeners and a late server response never writes hook state", async () => {
    const h = harness(); await h.start(); h.delivery = "hold"; h.advance(10000);
    h.unmount(); assert.equal(h.frames.size, 0); assert.equal(h.documentEvents.size, 0); assert.equal(h.windowEvents.size, 0);
    h.deliver(); await h.settle(); assert.equal(h.writesAfterUnmount, 0); assert.equal(h.calls.length, 2);
  });
  await test("unmount cancels owned retry and hidden timers", async () => {
    const h = harness(); await h.start(); h.delivery = "fail"; h.advance(10000); await h.settle();
    assert.equal(h.timers.size, 1); h.hide(); assert.equal(h.timers.size, 1);
    h.unmount(); assert.equal(h.timers.size, 0); h.advance(10000); await h.settle();
    assert.equal(h.calls.length, 2); assert.equal(h.writesAfterUnmount, 0);
  });
  await test("lethal battle tick stops RAF and final partial checkpoint records the exact score", async () => {
    const h = harness(() => {
      const state = engine.createRoyale(7); state.playerHp = 1;
      state.units.push({ id: 1, cardId: "ramen-negishi", side: "enemy", x: 300, y: 770,
        hp: 1100, maxHp: 1100, cooldown: 0, spawnTick: 0, hitUntil: 0, attackUntil: 0,
        slowUntil: 0, walkTicks: 0, shield: 0, hitCount: 0, damageScale: 1 }); state.nextId = 2;
      return state;
    });
    await h.start(); h.frame(); await h.settle();
    assert.equal(h.value.state.tick, 1); assert.equal(h.value.ended, true); assert.equal(h.value.saved, true);
    assert.equal(h.value.playing, false); assert.equal(h.frames.size, 0); assert.equal(h.calls[1].toTick, 1);
    assert.deepEqual(json(h.value.state), json(h.server)); h.unmount();
  });
  console.log(`${passed} YG Royale session checks passed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
