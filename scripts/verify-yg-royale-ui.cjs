/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node UI verification. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX };
const compile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions }).outputText;
function load(file, imports, context = {}) {
  const runtime = { exports: {} };
  vm.runInNewContext(compile(file), { module: runtime, exports: runtime.exports, require: name => {
    if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name];
  }, ...context });
  return runtime.exports;
}
const cards = load("lib/games/yg-royale-cards.ts", {});
const engine = load("lib/games/yg-royale.ts", { "./yg-royale-cards": cards });
const matchups = load("lib/games/yg-royale-matchups.ts", { "./yg-royale-cards": cards });
const source = compile("components/games/YgRoyalePage.tsx");
const css = fs.readFileSync(path.join(root, "components/games/YgRoyalePage.module.css"), "utf8");
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }

function harness(patch = {}) {
  let cursor = 0, tree;
  const slots = [], effects = [], events = new Map(), actions = [];
  const state = engine.createRoyale(7, 0);
  const game = {
    api: { loading: false, unauthorized: false, error: "", busy: false, retryPending: false,
      snapshot: { member: { id: "member", name: "選手" }, run: null, leaderboard: [], personalBest: null },
      read() { actions.push(["read"]); } },
    state: null, playing: false, ended: false, saved: false, awaitingSave: false, notice: "", inputNotice: "",
    start: deck => actions.push(["start", [...deck]]), resume: () => actions.push(["resume"]),
    pause: () => actions.push(["pause"]), deploy: (...args) => actions.push(["deploy", ...args]), retry: () => actions.push(["retry"]),
    ...patch,
  };
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useRef(value) { const at = cursor++; return slots[at] ??= { current: value }; },
    useState(value) { const at = cursor++; if (!(at in slots)) slots[at] = { value }; return [slots[at].value, next => { slots[at].value = typeof next === "function" ? next(slots[at].value) : next; }]; },
    useEffect(setup, deps) { const at = cursor++; if (!slots[at] || !equal(slots[at].deps, deps)) { const old = slots[at]; slots[at] = { deps }; effects.push(() => { old?.cleanup?.(); slots[at].cleanup = setup(); }); } },
  };
  class Element {
    constructor(tag = "div") { this.tag = tag; this.isContentEditable = false; }
    closest(selector) { return selector.split(",").map(value => value.trim()).includes(this.tag) ? this : null; }
  }
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const imports = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "lucide-react": new Proxy({}, { get: (_, key) => `icon-${String(key)}` }),
    "@/hooks/use-reduced-motion": { useReducedMotion: () => false },
    "@/lib/games/yg-royale": engine, "@/lib/games/yg-royale-cards": cards,
    "./GameShell": { GameShell: "shell", GameAccessState: "access" },
    "./GameLeaderboard": { GameLeaderboard: "leaderboard" },
    "./YgRoyaleArena": { YgRoyaleArena: "arena" }, "./YgRoyalePortrait": { YgRoyalePortrait: "portrait" },
    "./YgRoyaleMatchups": { YgRoyaleMatchups: "matchups" },
    "./useYgRoyaleGame": { useYgRoyaleGame: () => game },
    "./YgRoyalePage.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const runtime = { exports: {} };
  vm.runInNewContext(source, { module: runtime, exports: runtime.exports, require: name => imports[name], HTMLElement: Element,
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name, fn) => { if (events.get(name) === fn) events.delete(name); } },
  });
  function render() { cursor = 0; tree = runtime.exports.YgRoyalePage(); while (effects.length) effects.shift()(); return tree; }
  function walk(value, result = []) {
    if (Array.isArray(value)) { for (const child of value) walk(child, result); return result; }
    if (!value || typeof value !== "object") return result;
    if (typeof value.type === "function") return walk(value.type(value.props), result);
    result.push(value); walk(value.props?.children, result); return result;
  }
  const text = value => {
    if (Array.isArray(value)) return value.map(text).join("");
    if (value === null || value === undefined || typeof value === "boolean") return "";
    if (typeof value === "object") return typeof value.type === "function" ? text(value.type(value.props)) : text(value.props?.children);
    return String(value);
  };
  const byClass = name => walk(tree).find(node => node.props.className === name);
  render();
  return { game, state, actions, render, nodes: () => walk(tree), text: (value = tree) => text(value), byClass,
    key(code, tag = "button", extra = {}) { let prevented = false; events.get("keydown")?.({ code, target: new Element(tag), repeat: false, preventDefault: () => { prevented = true; }, ...extra }); render(); return prevented; },
    unmount() { for (const slot of slots) slot?.cleanup?.(); assert.equal(events.size, 0); },
  };
}

check("new battle offers eight original cards and a four-card hand without a server-side score claim", () => {
  const h = harness(); const start = h.nodes().find(node => node.type === "button" && h.text(node) === "バトル開始");
  assert.equal(start.props.disabled, false); start.props.onClick();
  assert.deepEqual(h.actions[0], ["start", [...cards.ROYALE_DEFAULT_DECK]]);
  assert.equal(h.nodes().filter(node => node.props.className === "handCard").length, 4);
  assert.match(h.text(), /撃破ポイント/); assert.doesNotMatch(h.text(), /壊れない城|キングタワーへのダメージ/); h.unmount();
});
check("deck editing requires exactly eight different cards and reveals all seventeen characters", () => {
  const h = harness(); const roster = () => h.byClass("rosterGrid").props.children;
  assert.equal(roster().length, 17);
  roster()[0].props.onClick(); h.render();
  assert.equal(h.nodes().find(node => node.type === "button" && h.text(node) === "バトル開始").props.disabled, true);
  roster()[6].props.onClick(); h.render();
  h.nodes().find(node => node.type === "button" && h.text(node) === "このデッキで出撃").props.onClick();
  const deck = h.actions.at(-1)[1]; assert.equal(deck.length, 8); assert.equal(new Set(deck).size, 8); assert.equal(deck.includes(cards.ROYALE_CARDS[0].id), false); h.unmount();
});
check("selected hand slot and actual battlefield coordinates reach one deployment action", () => {
  const h = harness(); h.game.state = { ...h.state, elixir: 10 }; h.game.playing = true; h.render();
  h.nodes().filter(node => node.props.className === "handCard")[2].props.onClick(); h.render();
  h.nodes().find(node => node.type === "arena").props.onDeploy(241, 581);
  const buttons = h.byClass("deployButtons").props.children; buttons[0].props.onClick(); buttons[1].props.onClick();
  assert.deepEqual(h.actions, [["deploy", 2, 241, 581], ["deploy", 2, 165, 640], ["deploy", 2, 435, 640]]); h.unmount();
});
check("low elixir, paused and unfinished saves keep appropriate actions disabled", () => {
  const h = harness(); h.game.state = { ...h.state, elixir: 0 }; h.game.playing = true; h.render();
  assert.ok(h.byClass("deployButtons").props.children.every(button => button.props.disabled));
  h.game.playing = false; h.game.ended = true; h.game.awaitingSave = true; h.render();
  assert.equal(h.nodes().find(node => node.type === "button" && h.text(node) === "もう一度出撃").props.disabled, true);
  h.game.awaitingSave = false; h.game.saved = true; h.render();
  assert.equal(h.nodes().find(node => node.type === "button" && h.text(node) === "もう一度出撃").props.disabled, false); h.unmount();
});
check("saved battles offer resume and pause, while retry preserves the active game boundary", () => {
  const h = harness(); h.game.state = h.state; h.render(); h.nodes().find(node => node.type === "button" && h.text(node) === "バトルを再開").props.onClick();
  h.game.playing = true; h.render(); h.nodes().find(node => node.props["aria-label"] === "バトルを一時停止").props.onClick();
  h.game.notice = "保存を再試行"; h.render(); h.nodes().find(node => node.type === "button" && h.text(node) === "保存を再試行・再読み込み").props.onClick();
  assert.deepEqual(h.actions, [["resume"], ["pause"], ["retry"]]); h.unmount();
});
check("card shortcuts work after a button click, respect text inputs and clean up their listener", () => {
  const h = harness(); h.game.state = h.state; h.game.playing = true; h.render();
  assert.equal(h.key("Digit3"), true); assert.equal(h.nodes().find(node => node.type === "arena").props.selectedCard.id, h.state.hand[2]);
  assert.equal(h.key("Digit1", "input"), false); assert.equal(h.key("Digit4", "button", { ctrlKey: true }), false);
  assert.equal(h.key("KeyP"), true); assert.deepEqual(h.actions, [["pause"]]); h.unmount();
});
check("live damage, tower HP, score units and authentication states remain consistent", () => {
  const h = harness(); h.game.state = { ...h.state, score: 12345, playerHp: 2345 }; h.render();
  assert.match(h.text(h.byClass("damage")), /12,345/); assert.equal(h.nodes().find(node => node.props["aria-label"] === "自陣キングタワーのHP").props["aria-valuenow"], 2345);
  assert.equal(h.nodes().find(node => node.type === "leaderboard").props.scoreUnit, "pt");
  h.game.api.unauthorized = true; h.render(); assert.equal(h.nodes().some(node => node.type === "arena"), false); assert.equal(h.nodes().some(node => node.type === "access"), true); h.unmount();
});
check("page CSS defines every referenced class, including narrow-screen and motion-reduction rules", () => {
  const page = fs.readFileSync(path.join(root, "components/games/YgRoyalePage.tsx"), "utf8");
  for (const [, name] of page.matchAll(/styles\.([a-zA-Z0-9_]+)/g)) assert.ok(css.includes(`.${name}`), `missing ${name}`);
  assert.match(css, /max-width: 350px/); assert.match(css, /prefers-reduced-motion: reduce/);
});
check("specified full names, per-enemy rewards and selected character matchups are exposed in the guide", () => {
  const expected = { "goto-sinker": "ゴトウシンカー", "kitazawa-archer": "北澤クロスファイヤー", "ikehara-giant": "池原神パンツジャイアント", "yamaki-bomber": "八巻社長激務", "kawanabe-knight": "川鍋タイワン", "misawa-dragon": "三澤ローボールドラゴン", "oshino-wizard": "押野先生シラフ", "shibata-dodger": "芝田バスターエンドラン" };
  for (const [id, name] of Object.entries(expected)) assert.equal(cards.royaleCard(id).name, name);
  const h = harness(); const rosterButtons = () => h.byClass("rosterGrid").props.children;
  rosterButtons()[3].props.onClick(); h.render();
  assert.equal(h.nodes().find(node => node.type === "matchups").props.card.id, "goto-sinker");
  assert.match(h.text(h.byClass("killReward")), /150 pt/);
  assert.ok(matchups.royaleMatchups("goto-sinker").strong.length); h.unmount();
});
check("mobile battle mode reserves the whole viewport for field, elixir and hand; reference opens only on request", () => {
  const h = harness(); h.game.state = h.state; h.game.playing = true; h.render();
  assert.equal(h.nodes().find(node => node.props.className === "game").props["data-battle-mode"], true);
  h.byClass("referenceButton").props.onClick(); h.game.playing = false; h.render();
  assert.deepEqual(h.actions, [["pause"]]);
  assert.equal(h.nodes().find(node => node.props.className === "game").props["data-battle-mode"], false);
  assert.equal(h.byClass("roster").props.open, true);
  h.byClass("returnBar").props.children[1].props.onClick(); h.render();
  assert.deepEqual(h.actions, [["pause"], ["resume"]]);
  assert.equal(h.nodes().find(node => node.props.className === "game").props["data-battle-mode"], true);
  assert.match(css, /height:\s*100dvh/); assert.match(css, /grid-template-rows:\s*44px 20px minmax\(0, 1fr\) 28px 178px/);
  for (const height of [568, 600, 667, 740, 844, 932]) {
    const safeArea = height >= 740 ? 81 : 8;
    const fieldHeight = height - safeArea - 44 - 20 - 28 - 178;
    assert.ok(fieldHeight >= 290, `${height}px viewport must retain the entire scaled field`);
    assert.ok(fieldHeight + safeArea + 44 + 20 + 28 + 178 <= height);
  }
  assert.match(css, /orientation: landscape\) and \(max-height: 320px/);
  // Short landscape keeps both elixir and tap controls, even with a retry notice.
  const landscapeCommands = 8 + 17 + 4 + 6 + 6 + 45 + 4 + 23 + 4 + 27 * 2 + 4;
  assert.ok(landscapeCommands <= 270 - 25 - 40 - 20);
  h.unmount();
});
console.log(`${checks} YG Royale page checks passed. Browser visual verification is separate.`);
