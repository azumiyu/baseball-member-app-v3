/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Node verification. */
// Web Audio lifecycle checks, with no sound device, browser, DB, or network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../components/pachi/usePachinkoAudio.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS ${name}`); }

function harness() {
  const slots = [], effects = [], listeners = new Map(), contexts = [], spoken = [];
  let cursor = 0, cancelled = 0, failOscillator = false, failInitialization = false;
  const navigator = { userActivation: { isActive: true } };
  const document = {
    hidden: false,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  class Param {
    value = 0;
    setValueAtTime(value) { this.value = value; }
    linearRampToValueAtTime(value) { this.value = value; }
    exponentialRampToValueAtTime(value) { assert.ok(value > 0); this.value = value; }
    setTargetAtTime(value) { this.value = value; }
  }
  class Node {
    disconnected = false;
    connected = [];
    connect(other) { this.connected.push(other); return other; }
    disconnect() { this.disconnected = true; }
  }
  class Source extends Node {
    frequency = new Param();
    started = false;
    stops = [];
    start(at = 0) { this.started = true; this.startAt = at; }
    stop(at = 0) { this.stops.push(at); }
  }
  class Context {
    state = "running";
    currentTime = 0;
    sampleRate = 8000;
    destination = new Node();
    nodes = [];
    resumes = 0;
    constructor() { contexts.push(this); }
    createGain() { const node = new Node(); node.gain = new Param(); this.nodes.push(node); return node; }
    createOscillator() { if (failOscillator) throw Error("device failure"); const node = new Source(); this.nodes.push(node); return node; }
    createBufferSource() { const node = new Source(); this.nodes.push(node); return node; }
    createBiquadFilter() { const node = new Node(); node.frequency = new Param(); this.nodes.push(node); return node; }
    createDynamicsCompressor() { const node = new Node(); for (const key of ["threshold", "knee", "ratio", "attack", "release"]) node[key] = new Param(); this.nodes.push(node); return node; }
    createBuffer(_channels, length) { if (failInitialization) throw Error("buffer allocation failed"); return { getChannelData: () => new Float32Array(length) }; }
    async resume() { this.resumes++; this.state = "running"; }
    async close() { this.state = "closed"; }
  }
  class Utterance { constructor(text) { this.text = text; } }
  const synthesis = { speaking: false, pending: false, speak: value => spoken.push(value), cancel: () => cancelled++ };
  const window = { AudioContext: Context, speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance };
  const React = {
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], value => { slots[index] = value; }]; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      const old = slots[index];
      // All callbacks in this hook have stable dependencies in real React.
      if (!old) effects.push(() => { slots[index] = { deps, cleanup: fn() }; });
    },
  };
  const runtimeModule = { exports: {} };
  vm.runInNewContext(code, { module: runtimeModule, exports: runtimeModule.exports, require: () => React, window, document, navigator, SpeechSynthesisUtterance: Utterance, Float32Array });
  let api;
  const render = () => { cursor = 0; api = runtimeModule.exports.usePachinkoAudio(); while (effects.length) effects.shift()(); return api; };
  render();
  return {
    get api() { return api; }, render, contexts, spoken, synthesis, navigator,
    get cancelled() { return cancelled; },
    visibility(hidden) { document.hidden = hidden; listeners.get("visibilitychange")?.(); },
    fail() { failOscillator = true; },
    failInitialization() { failInitialization = true; },
    sources: () => contexts.flatMap(context => context.nodes).filter(node => node instanceof Source),
    unmount() { for (const slot of slots) slot?.cleanup?.(); assert.equal(listeners.size, 0); },
  };
}

(async () => {
  await check("initial render, ambient changes, cues and speech never auto-create audio", () => {
    const h = harness(); h.api.setAmbience("normal"); h.api.play("jackpot"); h.api.shoutSeven(); h.api.unlock();
    assert.equal(h.contexts.length, 0); assert.equal(h.spoken.length, 0); assert.equal(h.api.enabled, false); h.unmount();
  });
  await check("sound opt-in requires a gesture and uses one shared, compressed output", () => {
    const h = harness(); h.navigator.userActivation.isActive = false; h.api.toggleSound(); assert.equal(h.contexts.length, 0);
    h.navigator.userActivation.isActive = true; h.api.toggleSound(); h.render(); assert.equal(h.api.enabled, true); assert.equal(h.contexts.length, 1);
    h.api.unlock(); h.api.unlock(); assert.equal(h.contexts.length, 1);
    assert.equal(h.contexts[0].nodes[0].gain.value, .45 * .65); assert.equal(h.contexts[0].nodes[1].ratio.value, 5); h.unmount();
  });
  await check("all cues schedule finite envelopes; mechanical noise, voice cap and ended cleanup work", () => {
    const h = harness(); h.api.toggleSound();
    for (const cue of ["launch", "pin", "entry", "prize", "stop", "reach", "super", "pitch", "swing", "push", "miss", "revival", "jackpot", "bonus", "rush", "rush-end", "empty", "stop-fire"]) h.api.play(cue);
    assert.equal(h.sources().length, 48);
    for (const source of h.sources()) { assert.ok(source.started); assert.ok(source.stops[0] > source.startAt); assert.ok(Number.isFinite(source.stops[0])); }
    h.api.play("jackpot"); assert.equal(h.sources().length, 48);
    h.sources()[0].onended(); h.api.play("entry"); assert.equal(h.sources().length, 49);
    h.api.stopAll(); assert.ok(h.sources().every(source => source.disconnected)); h.unmount();
  });
  await check("pin impacts are throttled and ambience changes replace rather than accumulate", () => {
    const h = harness(); h.api.toggleSound(); h.api.play("pin"); h.api.play("pin"); assert.equal(h.sources().length, 2);
    h.contexts[0].currentTime = .08; h.api.play("pin"); assert.equal(h.sources().length, 4);
    h.api.setAmbience("normal"); assert.equal(h.sources().length, 6); h.api.setAmbience("normal"); assert.equal(h.sources().length, 6);
    h.api.setAmbience("rush"); assert.equal(h.sources().length, 8); assert.ok(h.sources().slice(4, 6).every(source => source.disconnected));
    h.api.setAmbience("off"); assert.ok(h.sources().slice(4).every(source => source.disconnected)); h.unmount();
  });
  await check("volume clamps and zero volume cancels only owned speech", () => {
    const h = harness(); h.api.toggleSound(); h.api.setVolume(4); assert.equal(h.contexts[0].nodes[0].gain.value, .65);
    h.api.setVolume(NaN); assert.equal(h.contexts[0].nodes[0].gain.value, .65);
    h.synthesis.speaking = true; h.api.shoutSeven(); assert.equal(h.spoken.length, 0); h.synthesis.speaking = false;
    h.api.shoutSeven(); assert.equal(h.spoken[0].text, "カイリキー！！"); h.api.shoutSeven(); assert.equal(h.spoken.length, 1);
    h.api.setVolume(-1); assert.equal(h.contexts[0].nodes[0].gain.value, 0); assert.equal(h.cancelled, 1);
    h.api.shoutSeven(); assert.equal(h.spoken.length, 1); h.unmount(); assert.equal(h.cancelled, 1);
  });
  await check("hidden tabs stop all sources; returning never resumes a suspended device", () => {
    const h = harness(); h.api.toggleSound(); h.api.setAmbience("bonus"); h.api.play("jackpot"); h.api.shoutSeven();
    h.visibility(true); assert.ok(h.sources().every(source => source.disconnected)); assert.equal(h.cancelled, 1);
    const count = h.sources().length; h.api.play("launch"); assert.equal(h.sources().length, count);
    h.contexts[0].state = "suspended"; h.visibility(false); assert.equal(h.contexts[0].resumes, 0); assert.equal(h.sources().length, count);
    h.api.unlock(); assert.equal(h.contexts[0].resumes, 1); h.unmount();
  });
  await check("mute, device errors and unmount release sources and close the context", () => {
    const h = harness(); h.api.toggleSound(); h.api.setAmbience("rush"); h.api.play("launch"); h.api.toggleSound(); h.render();
    assert.equal(h.api.enabled, false); assert.ok(h.sources().every(source => source.disconnected));
    const count = h.sources().length; h.api.play("jackpot"); assert.equal(h.sources().length, count);
    h.api.setAmbience("off"); h.api.toggleSound(); h.fail(); assert.doesNotThrow(() => h.api.setAmbience("bonus"));
    assert.doesNotThrow(() => h.api.play("entry")); h.render(); assert.equal(h.api.enabled, false);
    h.unmount(); assert.equal(h.contexts[0].state, "closed"); h.api.unlock(); assert.equal(h.contexts.length, 1);
  });
  await check("partially initialized audio contexts close immediately on allocation failure", () => {
    const h = harness(); h.failInitialization(); assert.doesNotThrow(() => h.api.toggleSound()); h.render();
    assert.equal(h.api.enabled, false); assert.equal(h.contexts.length, 1); assert.equal(h.contexts[0].state, "closed"); h.unmount();
  });
  console.log(`Pachinko audio: ${checks} checks passed (mock API; audible quality needs a real device).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
