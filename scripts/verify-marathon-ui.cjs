/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS verification harness. */
/* Browser-free behavioral checks for the shared runner's API and presentation.
 * Run: node scripts/verify-marathon-ui.cjs
 * React hooks execute with a small deterministic scheduler; fetch never leaves
 * this process. These checks do not replace visual/device testing. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX,
};
const compile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions }).outputText;
function load(source, localRequire, context = {}) {
  const runtimeModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, context)(localRequire, runtimeModule, runtimeModule.exports);
  return runtimeModule.exports;
}
const engine = load(compile("lib/games/marathon.ts"), name => { throw Error(`Unexpected engine import: ${name}`); });
const hookSource = compile("components/games/useMarathonApi.ts");
const pageSource = compile("components/games/MarathonPage.tsx");
const NOW = 1_790_000_000_000;

function snapshot(patch = {}) {
  const value = {
    member: { id: "me", name: "テスト給水係", number: "99", role: "member" },
    gameId: "kobayashi-marathon", run: null, serverNow: NOW,
    state: { startedAt: NOW - 600_000, lastWateredAt: NOW - 300_000, revision: 0, totalWaterMl: 1500, lastGiverName: "前の給水係" },
    leaderboard: [{ rank: 1, playerId: "me", name: "テスト給水係", number: "99", score: 1250, achievedAt: NOW }],
    personalBest: { rank: 1, playerId: "me", name: "テスト給水係", number: "99", score: 1250, achievedAt: NOW },
    lastWater: null,
    ...patch,
  };
  value.state = { startedAt: NOW - 600_000, lastWateredAt: NOW - 300_000, revision: 0, totalWaterMl: 1500, lastGiverName: "前の給水係", ...patch.state };
  return value;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function eventTarget() {
  const groups = new Map();
  return {
    hidden: false,
    addEventListener(type, fn) {
      if (!groups.has(type)) groups.set(type, new Set());
      groups.get(type).add(fn);
    },
    removeEventListener(type, fn) { groups.get(type)?.delete(fn); },
    dispatch(type) { for (const fn of [...(groups.get(type) ?? [])]) fn(); },
    count() { return [...groups.values()].reduce((sum, group) => sum + group.size, 0); },
  };
}

function harness(page = false) {
  let slots = [], cursor = 0, effects = [], tree = null, latestApi;
  let localNow = 0, sequence = 0, entity = 0;
  const timers = new Map(), requests = [];
  const document = eventTarget();
  const dependenciesEqual = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  function schedule(fn, delay, recurring) {
    const token = ++sequence;
    timers.set(token, { fn, next: localNow + delay, delay, recurring });
    return token;
  }
  const window = {
    ...eventTarget(),
    setInterval: (fn, delay) => schedule(fn, delay, true),
    clearInterval: token => timers.delete(token),
  };
  const react = {
    useState(initial) {
      const at = cursor++;
      if (!slots[at]) slots[at] = { kind: "state", value: typeof initial === "function" ? initial() : initial };
      return [slots[at].value, value => { slots[at].value = typeof value === "function" ? value(slots[at].value) : value; }];
    },
    useRef(initial) {
      const at = cursor++;
      if (!slots[at]) slots[at] = { kind: "ref", current: initial };
      return slots[at];
    },
    useCallback(fn, deps) {
      const at = cursor++;
      if (!slots[at] || !dependenciesEqual(deps, slots[at].deps)) slots[at] = { kind: "callback", value: fn, deps };
      return slots[at].value;
    },
    useEffect(setup, deps) {
      const at = cursor++, previous = slots[at];
      if (!previous || !dependenciesEqual(deps, previous.deps)) {
        const next = { kind: "effect", setup, deps, cleanup: null };
        slots[at] = next;
        effects.push(() => { previous?.cleanup?.(); next.cleanup = setup(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const classes = new Proxy({}, { get: (_, key) => String(key) });
  const context = {
    window, document, AbortController,
    performance: { now: () => localNow },
    requestAnimationFrame: fn => schedule(fn, 16, false),
    cancelAnimationFrame: token => timers.delete(token),
    fetch: (url, options = {}) => {
      const response = deferred();
      const request = {
        url, options, method: options.method ?? "GET",
        body: options.body ? JSON.parse(options.body) : null,
        respond(status, value) { response.resolve({ status, ok: status >= 200 && status < 300, json: async () => value }); },
        reject: response.reject,
      };
      requests.push(request);
      return response.promise;
    },
  };
  let hook;
  const localRequire = name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "lucide-react") return new Proxy({}, { get: (_, key) => `icon-${String(key)}` });
    if (name.endsWith(".module.css")) return { default: classes };
    if (name === "@/lib/entity-id") return { createEntityId: () => `water-${++entity}` };
    if (name === "@/lib/games/marathon") return engine;
    if (name === "./useMarathonApi") return { useMarathonApi() { latestApi = hook.useMarathonApi(); return latestApi; } };
    if (name === "./GameShell") return { GameShell: "shell", GameAccessState: "access" };
    if (name === "./GameLeaderboard") return { GameLeaderboard: "leaderboard" };
    throw Error(`Unexpected import: ${name}`);
  };
  hook = load(hookSource, localRequire, context);
  const pageModule = page ? load(pageSource, localRequire, context) : null;
  function render() {
    cursor = 0; effects = [];
    if (page) tree = pageModule.MarathonPage();
    else latestApi = hook.useMarathonApi();
    for (const effect of effects) effect();
    return tree;
  }
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(item => nodes(item));
    return [node, ...nodes(node.props?.children ?? null)];
  }
  function text(node = tree) {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node !== "object") return String(node);
    if (Array.isArray(node)) return node.map(item => text(item)).join("");
    return text(node.props?.children ?? null);
  }
  async function settle() {
    await new Promise(setImmediate);
    render();
  }
  function advance(ms) {
    const target = localNow + ms;
    let iterations = 0;
    while (true) {
      const due = [...timers.entries()].filter(([, timer]) => timer.next <= target).sort((a, b) => a[1].next - b[1].next)[0];
      if (!due) break;
      assert.ok(++iterations < 100_000, "Scheduler entered an unexpected timer loop");
      const [token, timer] = due;
      localNow = timer.next;
      if (timer.recurring) timer.next += timer.delay;
      else timers.delete(token);
      timer.fn(localNow);
    }
    localNow = target;
    render();
  }
  function replayEffects() {
    const active = slots.filter(slot => slot?.kind === "effect");
    for (const slot of active) slot.cleanup?.();
    for (const slot of active) slot.cleanup = slot.setup();
    render();
  }
  function visibility(hidden) {
    document.hidden = hidden;
    document.dispatch("visibilitychange");
    render();
  }
  render();
  return {
    get api() { return latestApi; }, requests, document, nodes, text, render, settle, advance, replayEffects, visibility,
    timerCount: () => timers.size,
    async enter(value = snapshot()) { requests[0].respond(200, value); await settle(); },
    unmount() {
      for (const slot of slots) if (slot?.kind === "effect") slot.cleanup?.();
      assert.equal(document.count(), 0, "All document listeners must be released");
      assert.equal(window.count(), 0, "All window listeners must be released");
      assert.equal(timers.size, 0, "All drawing timers must be released");
    },
  };
}

let checks = 0;
async function check(name, task) {
  await task(); checks++;
  console.log("PASS", name);
}

(async () => {
  await check("entry makes one GET; elapsed distance uses the server/performance clock with no polling", async () => {
    const h = harness();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].url, "/api/games/marathon");
    assert.equal(h.requests[0].options.cache, "no-store");
    await h.enter();
    const before = engine.marathonDistanceKm(h.api.snapshot.state, h.api.now());
    h.advance(60_000);
    assert.equal(h.api.now(), NOW + 60_000);
    assert.ok(Math.abs(engine.marathonDistanceKm(h.api.snapshot.state, h.api.now()) - before - 0.3) < 1e-10);
    assert.equal(h.requests.length, 1);
    assert.equal(h.timerCount(), 0);
    h.unmount();
  });

  await check("rapid watering is locked synchronously and records only the accepted response", async () => {
    const h = harness(); await h.enter();
    const first = h.api.water();
    const duplicate = h.api.water();
    h.render();
    assert.equal(h.requests.length, 2);
    assert.equal(h.api.busy, true);
    assert.equal(await duplicate, null);
    const requestId = h.requests[1].body.requestId;
    h.requests[1].respond(200, snapshot({ state: { revision: 1 }, lastWater: { requestId, amountMl: 300, wateredAt: NOW, mood: "normal", multiplier: 1 } }));
    await first; await h.settle();
    assert.equal(h.api.busy, false);
    assert.equal(h.api.snapshot.state.revision, 1);
    assert.equal(h.api.snapshot.lastWater.amountMl, 300);
    h.unmount();
  });

  await check("network failure retries the identical request ID and expected revision", async () => {
    const h = harness(); await h.enter(snapshot({ state: { revision: 7 } }));
    const first = h.api.water();
    const original = h.requests[1].body;
    h.requests[1].reject(Error("回線が切れました"));
    await first; await h.settle();
    assert.equal(h.api.retryPending, true);
    assert.equal(h.api.busy, false);
    assert.ok(h.api.error.length > 0);
    const retry = h.api.water();
    assert.deepEqual(h.requests[2].body, original);
    assert.equal(original.expectedRevision, 7);
    h.requests[2].respond(200, snapshot({ state: { revision: 8 } }));
    await retry; await h.settle();
    assert.equal(h.api.retryPending, false);
    assert.equal(h.api.error, "");
    h.unmount();
  });

  await check("server failures keep the request retryable; validation errors discard it", async () => {
    const h = harness(); await h.enter();
    const first = h.api.water(); const original = h.requests[1].body;
    h.requests[1].respond(503, { error: "しばらくお待ちください" });
    await first; await h.settle();
    assert.equal(h.api.retryPending, true);
    const retry = h.api.water(); assert.deepEqual(h.requests[2].body, original);
    h.requests[2].respond(400, { error: "無効な給水" });
    await retry; await h.settle();
    assert.equal(h.api.retryPending, false);
    const next = h.api.water();
    assert.notEqual(h.requests[3].body.requestId, original.requestId);
    h.requests[3].respond(200, snapshot({ state: { revision: 1 } }));
    await next; await h.settle(); h.unmount();
  });

  await check("409 replaces shared state and clears pending so the next watering uses the new revision", async () => {
    const h = harness(); await h.enter();
    const first = h.api.water(); const original = h.requests[1].body;
    h.requests[1].respond(409, { error: "ほかの人が先に給水しました", snapshot: snapshot({ state: { revision: 3, lastGiverName: "ほかの給水係", lastWateredAt: NOW } }) });
    assert.equal(await first, null); await h.settle();
    assert.equal(h.api.snapshot.state.revision, 3);
    assert.equal(h.api.snapshot.state.lastGiverName, "ほかの給水係");
    assert.equal(h.api.retryPending, false);
    assert.match(h.api.error, /ほかの人/);
    const next = h.api.water();
    assert.equal(h.requests[2].body.expectedRevision, 3);
    assert.notEqual(h.requests[2].body.requestId, original.requestId);
    h.requests[2].respond(200, snapshot({ state: { revision: 4 } }));
    await next; await h.settle(); h.unmount();
  });

  await check("refresh and watering cannot overlap in either direction; duplicate reads are coalesced", async () => {
    const h = harness(); await h.enter();
    const water = h.api.water();
    assert.equal(await h.api.read(), null);
    assert.equal(h.requests.length, 2);
    h.requests[1].respond(200, snapshot({ state: { revision: 1 } })); await water; await h.settle();
    const refresh = h.api.read(); h.render();
    assert.equal(h.api.refreshing, true);
    assert.equal(await h.api.water(), null);
    assert.equal(await h.api.read(), null);
    assert.equal(h.requests.length, 3);
    h.requests[2].respond(200, snapshot({ state: { revision: 2 } })); await refresh; await h.settle();
    assert.equal(h.api.refreshing, false);
    assert.equal(h.api.snapshot.state.revision, 2);
    h.unmount();
  });

  await check("StrictMode's aborted old read cannot clear a new read's lock or replace its snapshot", async () => {
    const h = harness(); await h.enter();
    const oldRead = h.api.read();
    h.replayEffects();
    assert.equal(h.requests.length, 3);
    h.requests[1].respond(200, snapshot({ state: { revision: 99 } }));
    await oldRead; await h.settle();
    assert.equal(h.api.snapshot.state.revision, 0);
    assert.equal(await h.api.water(), null);
    assert.equal(h.requests.length, 3, "The new read lock survives the old read's finally block");
    h.requests[2].respond(200, snapshot({ state: { revision: 2 } })); await h.settle();
    assert.equal(h.api.snapshot.state.revision, 2);
    h.unmount();
  });

  await check("StrictMode entry cleanup rejects a late aborted entry response", async () => {
    const h = harness();
    h.replayEffects();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[0].options.signal.aborted, true);
    h.requests[1].respond(200, snapshot({ state: { revision: 3 } })); await h.settle();
    h.requests[0].respond(200, snapshot({ state: { revision: 0 } })); await h.settle();
    assert.equal(h.api.snapshot.state.revision, 3);
    assert.equal(h.api.loading, false);
    h.unmount();
  });

  await check("older revisions are rejected and delayed reads never move the runner clock backwards", async () => {
    const h = harness(); await h.enter(snapshot({ state: { revision: 4 } }));
    h.advance(30_000);
    const before = h.api.now();
    const stale = h.api.read();
    h.requests[1].respond(200, snapshot({ serverNow: NOW + 35_000, state: { revision: 2 } }));
    await stale; await h.settle();
    assert.equal(h.api.snapshot.state.revision, 4);
    const delayed = h.api.read();
    h.requests[2].respond(200, snapshot({ serverNow: NOW + 10_000, state: { revision: 4 } }));
    await delayed; await h.settle();
    assert.ok(h.api.now() >= before);
    assert.equal(h.api.now(), NOW + 30_000);
    h.unmount();
  });

  await check("visibility refresh waits 60 seconds, runs once, and cannot interrupt a watering", async () => {
    const h = harness(); await h.enter();
    h.advance(59_999); h.visibility(true); h.visibility(false);
    assert.equal(h.requests.length, 1);
    h.advance(1); h.visibility(true); h.visibility(false); h.visibility(false);
    assert.equal(h.requests.length, 2);
    h.requests[1].respond(200, snapshot({ serverNow: NOW + 60_000 })); await h.settle();
    h.visibility(true); h.visibility(false); assert.equal(h.requests.length, 2);
    h.advance(60_000); const water = h.api.water();
    h.visibility(true); h.visibility(false); assert.equal(h.requests.length, 3);
    h.requests[2].respond(200, snapshot({ serverNow: NOW + 120_000, state: { revision: 1 } })); await water; await h.settle();
    h.unmount();
  });

  await check("unauthorized responses switch to the login state and discard uncertain watering", async () => {
    const h = harness(); await h.enter();
    const water = h.api.water();
    h.requests[1].respond(401, { error: "ログインしてください" }); await water; await h.settle();
    assert.equal(h.api.unauthorized, true);
    assert.equal(h.api.retryPending, false);
    h.unmount();
    const page = harness(true);
    page.requests[0].respond(401, { error: "ログインしてください" }); await page.settle();
    assert.equal(page.nodes().find(node => node.type === "access").props.unauthorized, true);
    page.unmount();
  });

  await check("page shows the supplied runner, cumulative km, water action and cumulative-liter ranking", async () => {
    const h = harness(true); await h.enter(); h.advance(16);
    assert.match(h.text(h.nodes().find(node => node.type === "h1")), /小林の走れ！マラソン！/);
    assert.match(h.text(h.nodes().find(node => node.props?.className === "distance")), /3\.000km/);
    const water = h.nodes().find(node => node.type === "button" && node.props.className === "waterButton");
    assert.match(h.text(water), /小林に水をあげる！/);
    assert.equal(water.props.disabled, false);
    assert.match(h.text(), /目安/);
    const ranking = h.nodes().find(node => node.type === "leaderboard");
    assert.equal(ranking.props.cumulative, true);
    assert.equal(ranking.props.scoreUnit, "L");
    assert.equal(ranking.props.scoreScale, 1000);
    assert.equal(ranking.props.precision, 3);
    assert.match(h.text(h.nodes().find(node => node.props?.className === "totals")), /1\.250L/);
    assert.ok(h.nodes().find(node => node.type === "img" && node.props.src === "/homepage/introduce/4.JPEG"));
    const preload = h.nodes().find(node => node.type === "img" && node.props.src === "/game/kobayashi-runner.png");
    assert.ok(preload); preload.props.onLoad(); h.render();
    assert.ok(h.nodes().find(node => node.props?.className === "runnerSprite" && node.props.role === "img"));
    assert.ok(fs.existsSync(path.join(root, "public/game/kobayashi-runner.png")));
    h.advance(60_000);
    assert.match(h.text(h.nodes().find(node => node.props?.className === "distance")), /3\.300km/);
    assert.equal(h.requests.length, 1);
    h.unmount();
  });

  await check("global fullness disables watering for 10 seconds, then local drawing unlocks it without requests", async () => {
    const h = harness(true); await h.enter(snapshot({ state: { lastWateredAt: NOW } })); h.advance(16);
    const button = () => h.nodes().find(node => node.type === "button" && node.props.className === "waterButton");
    assert.equal(button().props.disabled, true);
    assert.match(h.text(button()), /おなかいっぱい/);
    h.advance(9_000); assert.equal(button().props.disabled, true);
    h.advance(1_000); assert.equal(button().props.disabled, false);
    assert.equal(h.requests.length, 1);
    h.unmount();
  });

  await check("both occasional moods display their actual shared labels and multipliers", async () => {
    for (const [kind, multiplier, label] of [["parched", 2, "ちょうのどかわいた！！"], ["runners-high", 0.5, "ランナーズハイ中！！"]]) {
      let startedAt;
      for (let seconds = 0; seconds < 3600; seconds++) {
        const candidate = NOW - seconds * 1000;
        if (engine.marathonMood({ startedAt: candidate }, NOW).kind === kind) { startedAt = candidate; break; }
      }
      assert.ok(startedAt, `Could not find a deterministic ${kind} fixture`);
      const h = harness(true); await h.enter(snapshot({ state: { startedAt } })); h.advance(16);
      const speech = h.nodes().find(node => node.props?.className === "speech");
      assert.match(h.text(speech), new RegExp(label));
      assert.ok(h.text(speech).includes(`給水できる量 × ${multiplier}`));
      assert.equal(h.nodes().find(node => node.props?.className === "scene").props["data-mood"], kind);
      h.unmount();
    }
  });

  await check("hidden pages stop drawing, retain their display, and catch up on visible return", async () => {
    const h = harness(true); await h.enter(); h.advance(16);
    const distance = () => h.text(h.nodes().find(node => node.props?.className === "distance"));
    const before = distance();
    assert.equal(h.timerCount(), 1);
    h.visibility(true);
    assert.equal(h.timerCount(), 0);
    assert.equal(h.nodes().find(node => node.props?.className === "scene").props["data-paused"], true);
    h.advance(120_000);
    assert.equal(distance(), before);
    assert.equal(h.requests.length, 1);
    h.visibility(false);
    assert.notEqual(distance(), before);
    assert.equal(h.timerCount(), 1);
    assert.equal(h.requests.length, 2);
    h.requests[1].respond(200, snapshot({ serverNow: NOW + 120_016 })); await h.settle();
    h.unmount();
  });

  await check("watering receipt announces accepted liters; reduced-motion and hidden CSS stop animations", async () => {
    const h = harness(true); await h.enter(); h.advance(16);
    h.nodes().find(node => node.type === "button" && node.props.className === "waterButton").props.onClick();
    const requestId = h.requests[1].body.requestId;
    h.requests[1].respond(200, snapshot({ state: { revision: 1, lastWateredAt: NOW }, lastWater: { requestId, amountMl: 600, wateredAt: NOW, mood: "parched", multiplier: 2 } }));
    await h.settle();
    const receipt = h.nodes().find(node => node.props?.className === "receipt");
    assert.equal(receipt.props["aria-live"], "polite");
    assert.match(h.text(receipt), /0\.600 L/);
    assert.match(h.text(receipt), /今回の給水量 × 2/);
    const css = fs.readFileSync(path.join(root, "components/games/Marathon.module.css"), "utf8");
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(css, /animation:\s*none\s*!important/);
    assert.match(css, /data-paused="true"[\s\S]*?animation-play-state:\s*paused/);
    assert.match(css, /background:[^;]*kobayashi-runner\.png[^;]*200% 200%/);
    h.unmount();
  });
  console.log(`Passed ${checks} marathon hook/UI regression groups. Browser visual/device QA remains separate.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
