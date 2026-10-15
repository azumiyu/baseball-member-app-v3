/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser-free verification. */
// Exercises real server rendering and board interaction; no network or database.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");
const sources = new Map();
const classes = new Proxy({}, { get: (_, key) => String(key) });
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function compile(file) {
  if (!sources.has(file)) sources.set(file, ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText);
  return sources.get(file);
}
function modules(react = React, runtime = require("react/jsx-runtime")) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const runtimeModule = { exports: {} }; cache.set(file, runtimeModule.exports);
    const localRequire = (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return runtime;
      if (name.endsWith(".module.css")) return { default: classes };
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      if (name.startsWith("./")) return load(path.posix.normalize(`${path.posix.dirname(file)}/${name.slice(2)}.ts`));
      throw Error(`Unexpected import ${name}`);
    };
    vm.runInThisContext(`(function(require,module,exports){${compile(file)}\n})`, { filename: file })(localRequire, runtimeModule, runtimeModule.exports);
    cache.set(file, runtimeModule.exports);
    return runtimeModule.exports;
  }
  return load;
}
const load = modules();
const { ROYALE_CARDS, ROYALE_DEFAULT_DECK } = load("lib/games/yg-royale-cards.ts");
const { createRoyale, ROYALE } = load("lib/games/yg-royale.ts");
const { YgRoyaleArena, royaleArenaCoordinates } = load("components/games/YgRoyaleArena.tsx");
const { YgRoyalePortrait } = load("components/games/YgRoyalePortrait.tsx");
const base = { state: null, selectedCard: null, active: false, paused: false, reducedMotion: false, onDeploy() {} };
const ready = createRoyale(100, 0, ROYALE_DEFAULT_DECK);
const specimen = { ...ready, score: 12345, playerHp: 2345, tick: 400, units: ROYALE_CARDS.map((card, index) => ({ id: index + 1, cardId: card.id, side: index % 2 ? "enemy" : "player", x: 80 + index % 6 * 86, y: 220 + Math.floor(index / 6) * 145, hp: card.hp / 2, maxHp: card.hp, cooldown: 1, spawnTick: 399, hitUntil: 405, attackUntil: 405, slowUntil: 405, walkTicks: 5, shield: card.trait === "shield" ? 320 : 0, hitCount: 1, damageScale: 1 })), effects: ["deploy", "hit", "projectile", "burst", "tower", "death", "wave", "dodge"].map((kind, index) => ({ id: index + 1, kind, side: index % 2 ? "enemy" : "player", x: 120 + index * 40, y: 420, tx: 280, ty: 610, cardId: "goto-sinker", amount: 123, tick: 395, until: 410 })) };

check("idle defense battlefield has only a player tower and a nonattackable reinforcement gate", () => {
  const html = renderToStaticMarkup(React.createElement(YgRoyaleArena, base));
  assert.match(html, /YG ROYALE/); assert.match(html, /ENEMY GATE/); assert.match(html, /5,000 \/ 5,000/);
  assert.match(html, /ENDLESS DEFENSE/); assert.match(html, /タワーを守れ/);
  assert.doesNotMatch(html, /壊れないキング|KING DAMAGE|ENDLESS SIEGE|不落の城/);
  assert.equal([...html.matchAll(/5,000 \/ 5,000/g)].length, 1);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/); assert.match(html, /viewBox="0 0 600 880"/);
  assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
});
check("all 17 characters and battle effects render using their supplied photographs", () => {
  const html = renderToStaticMarkup(React.createElement(YgRoyaleArena, { ...base, state: specimen, active: true, selectedCard: ROYALE_CARDS[0] }));
  for (const card of ROYALE_CARDS) assert.ok(html.includes(`href="${card.image}"`), `${card.id} portrait`);
  assert.match(html, /\+123 pt/); assert.match(html, /2,345 \/ 5,000/); assert.match(html, /スルー！/); assert.match(html, /敵の増援！/);
  assert.doesNotMatch(html, /KING DAMAGE|12,345|YOUR KING/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});
check("two arenas get different SVG gradient and clip identifiers", () => {
  const html = renderToStaticMarkup(React.createElement("div", null, React.createElement(YgRoyaleArena, base), React.createElement(YgRoyaleArena, base)));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length); assert.ok(ids.length > 10);
});
check("every card portrait defers image loading and retains character identity", () => {
  for (const card of ROYALE_CARDS) {
    const html = renderToStaticMarkup(React.createElement(YgRoyalePortrait, { card }));
    assert.ok(html.includes(card.image)); assert.match(html, /loading="lazy"/); assert.match(html, /aria-hidden="true"/); assert.doesNotMatch(html, /NaN|undefined/);
  }
});
check("pause and reduced motion are explicit render states", () => {
  const html = renderToStaticMarkup(React.createElement(YgRoyaleArena, { ...base, state: ready, active: true, paused: true, reducedMotion: true }));
  assert.match(html, /data-paused="true"/); assert.match(html, /data-reduced="true"/); assert.match(html, /作戦休憩中/);
  const css = fs.readFileSync(path.join(root, "components/games/YgRoyaleArena.module.css"), "utf8");
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /animation-play-state:paused/);
});

function harness(patch = {}) {
  let slots = [], cursor = 0, tree;
  const calls = [];
  const react = {
    memo: (component) => component,
    useId: () => "arena_test",
    useRef: (initial) => { const at = cursor++; if (!slots[at]) slots[at] = { current: initial }; return slots[at]; },
    useState(initial) { const at = cursor++; if (!slots[at]) slots[at] = { value: initial }; return [slots[at].value, (value) => { slots[at].value = typeof value === "function" ? value(slots[at].value) : value; }]; },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const component = modules(react, { jsx, jsxs: jsx }).call(null, "components/games/YgRoyaleArena.tsx").YgRoyaleArena;
  const props = { ...base, state: ready, active: true, selectedCard: ROYALE_CARDS[2], onDeploy: (x, y) => calls.push({ x, y }), ...patch };
  function render() { cursor = 0; tree = component(props); return tree.props.children.find((node) => node?.type === "svg"); }
  function click(x, y, detail = 1) { render().props.onClick({ detail, clientX: 10 + x / 2, clientY: 20 + y / 2, currentTarget: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 440 }) } }); }
  function clientClick(clientX, clientY, rect) { render().props.onClick({ detail: 1, clientX, clientY, currentTarget: { getBoundingClientRect: () => rect } }); }
  function key(key, shiftKey = false) { let prevented = false; render().props.onKeyDown({ key, shiftKey, preventDefault() { prevented = true; } }); return prevented; }
  return { render, click, clientClick, key, calls, props };
}
check("a mobile-size tap maps into the 600×880 battlefield in integer coordinates", () => {
  const h = harness(); h.click(165.2, 649.6); assert.deepEqual(h.calls, [{ x: 165, y: 650 }]);
  h.click(ROYALE.deployMaxX, ROYALE.deployMaxY); assert.deepEqual(h.calls[1], { x: 568, y: 760 });
});
check("short and wide mobile views preserve both towers' full original world coordinates", () => {
  for (const [width, height] of [[390, 420], [320, 280], [700, 260], [300, 620]]) {
    const rect = { left: 11, top: 23, width, height };
    const scale = Math.min(width / 600, height / 880);
    for (const [x, y] of [[165, 650], [435, 650], [32, 500], [568, 760], [300, 70], [300, 810]]) {
      const clientX = rect.left + (width - 600 * scale) / 2 + x * scale;
      const clientY = rect.top + (height - 880 * scale) / 2 + y * scale;
      const point = royaleArenaCoordinates(clientX, clientY, rect);
      assert.ok(point); assert.ok(Math.abs(point.x - x) < 1e-8); assert.ok(Math.abs(point.y - y) < 1e-8);
      const h = harness(); h.clientClick(clientX, clientY, rect);
      assert.equal(h.calls.length, y >= 500 && y <= 760 ? 1 : 0);
      if (h.calls.length) assert.deepEqual(h.calls[0], { x, y });
    }
  }
});
check("letterbox margins never deploy and invalid screen dimensions stay inert", () => {
  const wide = { left: 10, top: 20, width: 600, height: 300 };
  const tall = { left: 10, top: 20, width: 240, height: 800 };
  const h = harness();
  for (const [x, y, rect] of [[20, 240, wide], [590, 240, wide], [130, 45, tall], [130, 790, tall]]) {
    assert.equal(royaleArenaCoordinates(x, y, rect), null); h.clientClick(x, y, rect);
  }
  assert.equal(h.calls.length, 0);
  for (const rect of [{ ...wide, width: 0 }, { ...wide, height: 0 }, { ...wide, width: NaN }]) assert.equal(royaleArenaCoordinates(100, 100, rect), null);
  const css = fs.readFileSync(path.join(root, "components/games/YgRoyaleArena.module.css"), "utf8");
  assert.match(css, /\.arena\{[^}]*height:100%/); assert.match(css, /\.battlefield\{[^}]*width:100%;height:100%/);
});
check("enemy territory, river and outer wall never deploy a unit", () => {
  const h = harness(); for (const [x, y] of [[165, 300], [165, 450], [20, 650], [580, 650], [300, 790]]) h.click(x, y);
  assert.equal(h.calls.length, 0);
});
check("paused, finished, unselected and unaffordable boards ignore taps and Enter", () => {
  for (const patch of [{ paused: true }, { active: false }, { selectedCard: null }, { state: { ...ready, elixir: 0 } }]) {
    const h = harness(patch); h.click(165, 650); h.key("Enter"); assert.equal(h.calls.length, 0);
  }
});
check("keyboard Home/End select both lanes and Enter/Space deploy", () => {
  const h = harness(); assert.equal(h.key("End"), true); h.key("Enter"); assert.deepEqual(h.calls[0], { x: 435, y: 650 });
  h.key("Home"); h.key(" "); assert.deepEqual(h.calls[1], { x: 165, y: 650 });
});
check("keyboard movement stays inside the legal deploy bounds", () => {
  const h = harness(); for (let i = 0; i < 30; i++) { h.key("ArrowUp", true); h.key("ArrowLeft", true); }
  h.key("Enter"); assert.deepEqual(h.calls[0], { x: 32, y: 500 });
  for (let i = 0; i < 30; i++) { h.key("ArrowDown", true); h.key("ArrowRight", true); }
  h.key("Enter"); assert.deepEqual(h.calls[1], { x: 568, y: 760 }); assert.equal(h.key("a"), false);
});
console.log(`\n${checks} arena / portrait checks passed.`);
