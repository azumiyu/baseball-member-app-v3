/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS verification. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../components/pachi/PachinkoBallField.tsx');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

/** Small hook/DOM/RAF fixture: no browser installation, network, or real timers. */
function harness(initialProps = {}) {
  const hooks = [];
  const pendingEffects = [];
  let cursor = 0;
  let now = 0;
  let frameId = 0;
  let box = { width: 300, height: 310 };
  const frames = new Map();
  const cancellations = [];
  const transforms = [];
  const translations = [];
  const windowEvents = new Map();
  const documentEvents = new Map();
  const observers = [];
  const gradient = { addColorStop() {} };
  const context = {
    createRadialGradient: () => gradient,
    setTransform: (...args) => transforms.push(args),
    translate: (x, y) => translations.push({ x, y }),
    clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
    save() {}, restore() {}, rotate() {}, ellipse() {}, moveTo() {}, lineTo() {},
  };
  const element = { width: 600, height: 620, getContext: () => context, getBoundingClientRect: () => box };
  const window = {
    devicePixelRatio: 3,
    addEventListener: (type, fn) => windowEvents.set(type, fn),
    removeEventListener: (type, fn) => { if (windowEvents.get(type) === fn) windowEvents.delete(type); },
  };
  const document = {
    hidden: false,
    addEventListener: (type, fn) => documentEvents.set(type, fn),
    removeEventListener: (type, fn) => { if (documentEvents.get(type) === fn) documentEvents.delete(type); },
  };
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe(target) { assert.equal(target, element); this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const react = {
    useRef(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: { current: initial } };
      return hooks[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = hooks[index];
      const changed = !previous || deps.some((value, i) => !Object.is(value, previous.deps[i]));
      if (!changed) return;
      const next = { deps, cleanup: previous?.cleanup };
      hooks[index] = next;
      pendingEffects.push(() => { next.cleanup?.(); next.cleanup = callback(); });
    },
  };
  const physics = {
    BALL_RADIUS: 5, BOARD_WIDTH: 600, BOARD_HEIGHT: 620,
    BOARD_PINS: [{ x: 260, y: 305, r: 2.7 }],
    sampleBallFlight: (flight, rawProgress) => {
      const progress = Math.max(0, Math.min(1, rawProgress));
      const [a, b] = flight.points;
      return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
    },
  };
  const runtimeModule = { exports: {} };
  const sandbox = {
    module: runtimeModule, exports: runtimeModule.exports,
    require: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === './pachinko-physics') return physics;
      throw new Error(`Unexpected fixture import: ${name}`);
    },
    performance: { now: () => now }, window, document, ResizeObserver,
    requestAnimationFrame: callback => { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => { cancellations.push(id); frames.delete(id); },
  };
  vm.runInNewContext(compiled, sandbox, { filename: file });
  let props = { balls: [], reducedMotion: false, paused: false, ...initialProps };
  let output;
  const render = patch => {
    props = { ...props, ...patch };
    cursor = 0;
    output = runtimeModule.exports.PachinkoBallField(props);
    output.props.ref.current = element;
    while (pendingEffects.length) pendingEffects.shift()();
    return output;
  };
  render({});
  return {
    render, frames, cancellations, translations, transforms, element, context, observers, windowEvents, documentEvents,
    get output() { return output; },
    advance(milliseconds) {
      now += milliseconds;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(now);
    },
    passTime(milliseconds) { now += milliseconds; },
    visibility(hidden) { document.hidden = hidden; documentEvents.get('visibilitychange')?.(); },
    resize(width, height, dpr) { box = { width, height }; window.devicePixelRatio = dpr; for (const observer of observers) if (observer.connected) observer.callback(); },
    lastPosition() { return translations.at(-1); },
    unmount() { for (const hook of hooks) hook.cleanup?.(); },
  };
}
function ball(id = 1) { return { id, flight: { durationMs: 1000, points: [{ x: 10, y: 30 }, { x: 510, y: 580 }] } }; }
function position(h, progress) {
  assert.ok(Math.abs(h.lastPosition().x - (10 + progress * 500)) < .0001, `${h.lastPosition().x} at progress ${progress}`);
  assert.ok(Math.abs(h.lastPosition().y - (30 + progress * 550)) < .0001);
}
let cases = 0;
function check(name, run) { run(); cases++; console.log(`PASS ${name}`); }

check('one RAF draws all balls, with full-size canvas geometry and DPR capped at two', () => {
  const h = harness({ balls: [ball()] });
  assert.equal(h.element.width, 600);
  assert.equal(h.element.height, 620);
  assert.equal(h.output.props.style.width, '100%');
  assert.equal(h.output.props.style.height, '100%');
  assert.equal(h.output.props.style.inset, 0);
  assert.equal(h.output.props.style.pointerEvents, 'none');
  assert.equal(h.frames.size, 1);
  assert.deepEqual(h.transforms.at(-1), [1, 0, 0, 1, 0, 0]);
  h.advance(200);
  position(h, .2);
  h.unmount();
});
check('React rerenders, replaced ball objects and sound callbacks never restart a flight', () => {
  const h = harness({ balls: [ball()] });
  h.advance(100);
  h.passTime(30);
  h.render({ balls: [ball()], onImpact: () => {} });
  position(h, .13);
  h.advance(70);
  position(h, .2);
  assert.equal(h.frames.size, 1);
  h.unmount();
});
check('pause freezes remaining flight time and resume excludes the whole paused interval', () => {
  const h = harness({ balls: [ball()] });
  h.advance(100);
  h.passTime(25);
  h.render({ paused: true });
  position(h, .125);
  assert.equal(h.frames.size, 0);
  h.advance(5000);
  position(h, .125);
  h.render({ paused: false });
  position(h, .125);
  h.advance(75);
  position(h, .2);
  h.unmount();
});
check('hidden tabs stop RAF, preserve age and resume without a time jump', () => {
  const h = harness({ balls: [ball()] });
  h.advance(100);
  h.passTime(25);
  h.visibility(true);
  position(h, .125);
  assert.equal(h.frames.size, 0);
  h.advance(9000);
  h.visibility(false);
  position(h, .125);
  h.advance(75);
  position(h, .2);
  h.unmount();
});
check('resize and long foreground frames preserve the same flight clock', () => {
  const h = harness({ balls: [ball()] });
  h.advance(100);
  h.passTime(25);
  h.resize(420, 434, 1.5);
  assert.equal(h.element.width, 630);
  assert.equal(h.element.height, 651);
  position(h, .125);
  assert.deepEqual(h.transforms.at(-1), [1.05, 0, 0, 1.05, 0, 0]);
  h.advance(275);
  position(h, .4);
  h.unmount();
});
check('all sixteen visible balls are painted; clearing them stops the RAF', () => {
  const h = harness({ balls: Array.from({ length: 20 }, (_, i) => ball(i + 1)) });
  h.translations.length = 0;
  h.advance(100);
  assert.equal(h.translations.length, 16);
  assert.equal(h.frames.size, 1);
  h.render({ balls: [] });
  assert.equal(h.frames.size, 0);
  h.translations.length = 0;
  h.advance(200);
  assert.equal(h.translations.length, 0);
  h.unmount();
});
check('motion preference is captured at launch and changing it does not move an existing ball', () => {
  const h = harness({ balls: [ball()] });
  h.advance(100);
  h.render({ reducedMotion: true });
  h.advance(100);
  position(h, .2);
  h.render({ balls: [ball(2)] });
  h.translations.length = 0;
  h.advance(200);
  assert.equal(h.translations.length, 0, 'new low-motion balls do not travel across the field');
  h.advance(650);
  position(h, 1);
  h.unmount();
});
check('unmount cancels its frame and removes resize/visibility listeners and observer', () => {
  const h = harness({ balls: [ball()] });
  assert.equal(h.observers.length, 1);
  assert.equal(h.observers[0].connected, true);
  h.unmount();
  assert.equal(h.frames.size, 0);
  assert.ok(h.cancellations.length > 0);
  assert.equal(h.observers[0].connected, false);
  assert.equal(h.windowEvents.size, 0);
  assert.equal(h.documentEvents.size, 0);
  const count = h.translations.length;
  h.advance(1000);
  assert.equal(h.translations.length, count);
});
console.log(`Verified ${cases} pachinko canvas lifecycle checks.`);
