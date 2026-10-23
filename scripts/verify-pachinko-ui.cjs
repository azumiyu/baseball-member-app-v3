/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser-free UI behavior harness. */
// Run: node scripts/verify-pachinko-ui.cjs
// Exercises real page handlers/effects with an isolated game and audio adapter.
// This verifies wiring and accessibility states; it does not replace visual QA.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const source = ts.transpileModule(fs.readFileSync(path.join(root, "components/pachi/PachinkoPage.tsx"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness(patch = {}, assetsReady = true) {
  let slots = [], cursor = 0, effects = [], tree;
  const actions = [], cues = [], listeners = new Map();
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useRef(value) { const at = cursor++; return slots[at] ??= { current: value }; },
    useCallback(fn, deps) {
      const at = cursor++;
      if (!slots[at] || !same(deps, slots[at].deps)) slots[at] = { value: fn, deps };
      return slots[at].value;
    },
    useEffect(setup, deps) {
      const at = cursor++, previous = slots[at];
      if (!previous || !same(deps, previous.deps)) {
        const next = { kind: "effect", setup, deps, cleanup: null };
        slots[at] = next;
        effects.push(() => { previous?.cleanup?.(); next.cleanup = setup(); });
      }
    },
  };
  class Element {
    constructor(interactive = false, editable = false) { this.interactive = interactive; this.isContentEditable = editable; }
    closest() { return this.interactive ? this : null; }
  }
  const window = {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  const game = {
    phase: "idle", mode: "normal", heat: "normal", gameId: 0, entryId: 0, symbols: [1, 2, 3], moving: [false, false, false],
    isSeven: false, revived: false, balls: [], holds: [], jackpots: 0, completed: 0, bonusRound: 0,
    ballsOwned: 2500, totalLaunched: 0, totalPayout: 0, firing: false, power: 56, rushRemaining: 0,
    bonusRoundsTotal: 5, bonusHits: 0, chain: 0, maxChain: 0, preview: false, paused: false,
    lastPayout: 0, payoutId: 0, attackerOpen: false, canPreview: true, canLaunch: true, rushEntry: false, status: "発射待ち",
    launchBall() { actions.push(["launch"]); }, push() { actions.push(["push"]); },
    setFiring(value) { actions.push(["firing", value]); game.firing = value; },
    setPower(value) { actions.push(["power", value]); game.power = Math.max(0, Math.min(100, value)); },
    setPaused(value) { actions.push(["paused", value]); game.paused = value; },
    refill() { actions.push(["refill"]); }, previewJackpot() { actions.push(["preview"]); },
    ...patch,
  };
  const audio = {
    enabled: false, volume: .5,
    unlock() { actions.push(["unlock"]); }, play(cue) { cues.push(cue); }, shoutSeven() { cues.push("shout"); },
    toggleSound() { actions.push(["sound"]); audio.enabled = !audio.enabled; },
    setVolume(value) { actions.push(["volume", value]); audio.volume = value; },
    stopAll() { actions.push(["stopAll"]); }, setAmbience(mode) { actions.push(["ambience", mode]); },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const classes = new Proxy({}, { get: (_, key) => String(key) });
  const imports = name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "lucide-react") return new Proxy({}, { get: (_, key) => `icon-${String(key)}` });
    if (name.endsWith(".module.css")) return { default: classes };
    if (name === "@/hooks/use-reduced-motion") return { useReducedMotion: () => false };
    if (name === "./PachinkoBoard") return { PachinkoBoard: "board" };
    if (name === "./usePachinkoAssets") return { usePachinkoAssets: () => ({ ready: assetsReady, total: 9, loaded: assetsReady ? 9 : 0, failed: [] }) };
    if (name === "./usePachinkoAudio") return { usePachinkoAudio: () => audio };
    if (name === "./usePachinkoGame") return { usePachinkoGame: () => game };
    if (name === "./pachinko-game") return { HOLD_CAPACITY: 4 };
    throw new Error(`Unexpected import: ${name}`);
  };
  const mod = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { window, HTMLElement: Element })(imports, mod, mod.exports);
  function render() { cursor = 0; effects = []; tree = mod.exports.PachinkoPage(); for (const effect of effects) effect(); return tree; }
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(item => nodes(item));
    return [node, ...nodes(node.props?.children ?? null)];
  }
  function text(node = tree) {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node !== "object") return String(node);
    if (Array.isArray(node)) return node.map(item => text(item)).join("");
    return text(node.props?.children ?? null);
  }
  function byClass(name) { const item = nodes().find(node => node.props?.className === name); assert.ok(item, `Missing .${name}`); return item; }
  function key(code, patch = {}) {
    const event = { code, target: new Element(), defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...patch };
    for (const fn of [...(listeners.get("keydown") ?? [])]) fn(event);
    return event;
  }
  render();
  return { game, actions, cues, audio, nodes, text, render, byClass, key, Element,
    click(name) { const button = byClass(name); if (!button.props.disabled) button.props.onClick(); render(); },
    clear() { actions.length = 0; cues.length = 0; },
    unmount() { for (const slot of slots) if (slot?.kind === "effect") slot.cleanup?.(); assert.equal([...listeners.values()].reduce((sum, set) => sum + set.size, 0), 0, "keyboard listeners are released"); },
    replayEffects() { const current = slots.filter(slot => slot?.kind === "effect"); for (const slot of current) slot.cleanup?.(); for (const slot of current) slot.cleanup = slot.setup(); render(); },
    listenerCount() { return listeners.get("keydown")?.size ?? 0; },
  };
}

let checks = 0;
function check(name, task) { task(); checks++; console.log("PASS", name); }

check("continuous play starts and stops through the visible control, with gesture-only audio unlock", () => {
  const h = harness(); h.clear(); h.click("launch");
  assert.deepEqual(h.actions.slice(0, 2), [["unlock"], ["firing", true]]);
  assert.equal(h.byClass("launch").props["aria-pressed"], true);
  assert.match(h.text(h.byClass("launch")), /発射を止める/);
  h.click("launch"); assert.equal(h.game.firing, false); assert.ok(h.cues.includes("stop-fire")); h.unmount();
});
check("single-ball and PUSH controls remain gated by engine availability", () => {
  const h = harness(); h.clear(); h.click("singleLaunch"); assert.deepEqual(h.actions, [["unlock"], ["launch"]]);
  h.clear(); h.click("push"); assert.equal(h.actions.length, 0);
  h.game.phase = "push"; h.render(); h.click("push"); assert.deepEqual(h.actions.slice(-2), [["unlock"], ["push"]]); assert.ok(h.cues.includes("push"));
  h.game.paused = true; h.render(); h.clear(); h.click("push"); assert.equal(h.actions.length, 0); h.unmount();
});
check("space drives firing or PUSH, arrows adjust power and P toggles rest", () => {
  const h = harness(); h.clear(); assert.equal(h.key("Space").defaultPrevented, true); assert.equal(h.game.firing, true); h.render();
  h.key("Space"); assert.equal(h.game.firing, false); h.game.phase = "push"; h.render(); h.key("Space"); assert.ok(h.actions.some(action => action[0] === "push"));
  h.game.phase = "idle"; h.render(); h.key("ArrowRight"); assert.equal(h.game.power, 59); h.render(); h.key("ArrowLeft"); assert.equal(h.game.power, 56); h.render();
  h.key("KeyP"); assert.equal(h.game.paused, true); h.render(); h.key("KeyP"); assert.equal(h.game.paused, false); h.unmount();
});
check("shortcuts respect focused controls, text entry, modifiers and repeated keys", () => {
  const h = harness(); h.clear();
  for (const patch of [{ target: new h.Element(true) }, { target: new h.Element(false, true) }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }]) {
    const event = h.key("Space", patch); assert.equal(event.defaultPrevented, false);
  }
  assert.equal(h.actions.length, 0); h.unmount();
});
check("loading, rest, demo and empty credit block firing from mouse and keyboard", () => {
  for (const [patch, ready] of [[{}, false], [{ paused: true }, true], [{ preview: true }, true], [{ ballsOwned: 0 }, true]]) {
    const h = harness(patch, ready); h.clear(); assert.equal(h.byClass("launch").props.disabled, true); h.key("Space");
    assert.equal(h.actions.some(action => action[0] === "firing"), false); h.unmount();
  }
});
check("manual rest stops sound and offers an operable resume action", () => {
  const h = harness(); h.clear(); h.click("pauseButton");
  assert.equal(h.game.paused, true); assert.ok(h.actions.some(action => action[0] === "stopAll"));
  assert.match(h.text(h.byClass("pauseShade")), /遊技を再開する/);
  const resume = h.nodes(h.byClass("pauseShade")).find(node => node.type === "button"); resume.props.onClick(); h.render();
  assert.equal(h.game.paused, false); assert.match(h.text(h.byClass("status")), /発射待ち/); h.unmount();
});
check("demo starts only when engine permits it and exposes a record-free label", () => {
  const h = harness(); h.clear(); const demo = () => h.nodes(h.byClass("experienceCard")).find(node => node.type === "button");
  assert.equal(demo().props.disabled, false); demo().props.onClick(); assert.deepEqual(h.actions.slice(0, 2), [["unlock"], ["preview"]]);
  h.game.canPreview = false; h.game.preview = true; h.render(); assert.equal(demo().props.disabled, true); assert.match(h.text(), /演出体験中/); assert.match(h.text(), /遊技記録に加算されない/); h.unmount();
});
check("refills are disabled while credit remains and available at zero", () => {
  const h = harness(); assert.equal(h.byClass("refillButton").props.disabled, true); h.clear(); h.click("refillButton"); assert.equal(h.actions.length, 0);
  h.game.ballsOwned = 0; h.render(); assert.equal(h.byClass("refillButton").props.disabled, false); h.click("refillButton"); assert.ok(h.actions.some(action => action[0] === "refill"));
  assert.match(h.text(h.byClass("mobileDock")), /無料補給/); h.unmount();
});
check("normal and RUSH share the physical power slider with clear aiming hints", () => {
  const h = harness(); const slider = () => h.nodes().find(node => node.props?.id === "pachinko-power");
  slider().props.onChange({ target: { value: "88" } }); assert.equal(h.game.power, 88); h.game.mode = "rush"; h.game.rushRemaining = 32; h.render();
  assert.match(slider().props["aria-valuetext"], /右打ちは88/); assert.match(h.text(h.byClass("modeStrip")), /右打ち/); assert.match(h.text(h.byClass("modeStrip")), /32/); h.unmount();
});
check("rotary handle changes power by pointer drag, releases capture and supports keyboard boundaries", () => {
  const h = harness(); h.clear(); const knob = () => h.byClass("handle");
  const captured = [], target = { setPointerCapture: id => captured.push(["capture", id]), releasePointerCapture: id => captured.push(["release", id]) };
  knob().props.onPointerDown({ clientX: 10, clientY: 20, pointerId: 7, currentTarget: target });
  knob().props.onPointerMove({ clientX: 30, clientY: 0 }); assert.equal(h.game.power, 88); h.render();
  knob().props.onPointerUp({ pointerId: 7, currentTarget: target }); knob().props.onPointerMove({ clientX: 90, clientY: 0 }); assert.equal(h.game.power, 88);
  assert.deepEqual(captured, [["capture", 7], ["release", 7]]);
  for (const [key, power] of [["Home", 0], ["End", 100], ["ArrowDown", 97]]) {
    let prevented = false, stopped = false;
    knob().props.onKeyDown({ key, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assert.equal(h.game.power, power); assert.ok(prevented && stopped); h.render();
  }
  assert.equal(knob().props["aria-valuenow"], 97); h.unmount();
});
check("sound stays opt-in and exposes adjustable volume without launching play", () => {
  const h = harness(); h.clear(); assert.equal(h.byClass("sound").props["aria-pressed"], false); h.click("sound");
  assert.equal(h.byClass("sound").props["aria-pressed"], true); const volume = h.nodes().find(node => node.props?.id === "pachi-volume"); volume.props.onChange({ target: { value: "25" } });
  assert.equal(h.audio.volume, .25); assert.equal(h.actions.some(action => ["launch", "firing"].includes(action[0])), false); h.unmount();
});
check("launch, entry and payout cues fire once per event and a hidden/resting view is silent", () => {
  const h = harness(); h.clear(); h.game.balls = [{ id: 1 }]; h.game.entryId = 1; h.game.lastPayout = 3; h.game.payoutId = 1; h.render();
  for (const cue of ["launch", "entry", "prize"]) assert.equal(h.cues.filter(value => value === cue).length, 1);
  h.render(); assert.equal(h.cues.length, 3); h.game.paused = true; h.game.balls = [{ id: 2 }]; h.game.entryId = 2; h.game.payoutId = 2; h.render(); assert.equal(h.cues.length, 3); h.unmount();
});
check("repeated renders and Strict Mode effect replay retain one keyboard listener, then release it", () => {
  const h = harness(); for (let i = 0; i < 20; i++) { h.game.power = i; h.render(); }
  assert.equal(h.listenerCount(), 1); h.replayEffects(); assert.equal(h.listenerCount(), 1); h.clear(); h.key("Space"); assert.equal(h.actions.filter(action => action[0] === "firing").length, 1); h.unmount();
});
function loadPure(file, otherImports = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  const jsx = (type, props, key) => ({ type, props, key });
  const imports = name => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (otherImports[name]) return otherImports[name];
    throw new Error(`Unexpected pure-component import ${name}`);
  };
  vm.runInNewContext(`(function(require,module,exports){${js}\n})`)(imports, mod, mod.exports);
  return mod.exports;
}
function expand(node) {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(expand);
  if (typeof node.type === "function") return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
}
function pureNodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(pureNodes);
  return [node, ...pureNodes(node.props?.children)];
}
function pureText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(pureText).join("");
  return pureText(node.props?.children);
}
const pureGame = loadPure("components/pachi/pachinko-game.ts");
const { SymbolDisplay } = loadPure("components/pachi/SymbolDisplay.tsx", { "./pachinko-game": pureGame });
const { BaseballShow } = loadPure("components/pachi/BaseballShow.tsx");
const reelProps = { symbols: [4, 5, 6], moving: [true, true, true], reach: false, jackpot: false, dimmed: false };
const showProps = { phase: "jackpot", heat: "normal", isSeven: false, revived: false, bonusRound: 1, symbols: [4, 4, 4] };

check("vertical moving reels retain all nine symbols plus a seamless first-symbol repeat", () => {
  const tree = expand(SymbolDisplay(reelProps));
  const strips = pureNodes(tree).filter(node => node.props?.className === "movingStrip");
  assert.equal(strips.length, 3);
  const images = strip => pureNodes(strip).filter(node => node.type === "img").map(node => node.props.src);
  const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1].map(id => `/pachi/${id}.png`);
  for (const strip of strips) assert.deepEqual(images(strip), expected);
  const changed = expand(SymbolDisplay({ ...reelProps, symbols: [8, 1, 3] }));
  assert.deepEqual(images(changed), images(tree), "cosmetic engine symbol ticks never swap the moving strip");
  assert.match(tree.props["aria-label"], /左4、中5、右6/);
});
check("stopped reels expose exact center symbols, adjacent wraparound and side locks during reach", () => {
  const tree = expand(SymbolDisplay({ ...reelProps, symbols: [1, 7, 1], moving: [false, true, false], reach: true }));
  const stopped = pureNodes(tree).filter(node => node.props?.className === "stoppedStrip");
  assert.equal(stopped.length, 2);
  for (const strip of stopped) assert.deepEqual(pureNodes(strip).filter(node => node.type === "img").map(node => node.props.src), ["/pachi/9.png", "/pachi/1.png", "/pachi/2.png"]);
  assert.equal(pureNodes(tree).filter(node => node.props?.className === "lockMark").length, 2);
});
check("non-seven jackpot result shows its actual three winning numbers and RUSH award", () => {
  const tree = expand(BaseballShow({ ...showProps, rushEntry: true }));
  const winning = pureNodes(tree).find(node => node.props?.className === "winningNumbers");
  assert.equal(pureText(winning), "444");
  assert.equal(pureNodes(tree).some(node => node.props?.className === "sevenCrown"), false);
  assert.match(pureText(tree), /逆転 RUSH 突入/);
});
check("777 retains the dedicated crown and celebration while normal phases have no cinematic overlay", () => {
  const tree = expand(BaseballShow({ ...showProps, symbols: [7, 7, 7], isSeven: true }));
  assert.equal(pureText(pureNodes(tree).find(node => node.props?.className === "sevenCrown")), "777");
  assert.match(pureText(tree), /カイリキー/);
  assert.equal(pureNodes(tree).some(node => node.props?.className === "winningNumbers"), false);
  assert.equal(BaseballShow({ ...showProps, phase: "varying" }), null);
});
check("bonus presentation follows actual round, ten-ball counter, payout and closed-gate state", () => {
  const tree = expand(BaseballShow({ ...showProps, phase: "bonus", bonusRound: 3, bonusRoundsTotal: 10, bonusHits: 6, roundPayout: 90, attackerOpen: false }));
  const inning = pureNodes(tree).find(node => node.props?.className === "inning");
  assert.match(pureText(inning), /ROUND3\/ 10GET 90 玉/);
  assert.equal(pureNodes(tree).filter(node => node.props?.["data-hit"] === true).length, 6);
  assert.equal(pureNodes(tree).find(node => node.props?.className === "bonusScene").props["data-open"], false);
  assert.match(pureText(tree), /ROUND COMPLETE/); assert.match(pureText(tree), /1,500 BALLS/);
});
console.log(`\n${checks} pachinko UI and presentation checks passed. Visual/device QA is separate.`);
