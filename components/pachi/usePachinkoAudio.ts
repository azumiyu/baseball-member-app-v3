"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PachinkoCue = "launch" | "pin" | "entry" | "prize" | "stop" | "reach" | "super" | "pitch" | "swing" | "push" | "miss" | "revival" | "jackpot" | "bonus" | "rush" | "rush-end" | "empty" | "stop-fire";
export type PachinkoAmbience = "off" | "normal" | "rush" | "bonus";
type Note = readonly [frequency: number, offset: number, duration: number, gain?: number, wave?: OscillatorType, slide?: number];
type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[] };
type Output = { context: AudioContext; master: GainNode; compressor: DynamicsCompressorNode; noise: AudioBuffer };

const CUES: Record<PachinkoCue, readonly Note[]> = {
  launch: [[118, 0, .065, .07, "triangle", 46], [1680, .008, .025, .014, "sine", 700]],
  pin: [[3720, 0, .028, .018, "sine", 2840], [6110, .002, .015, .006]],
  entry: [[1318.51, 0, .09, .045], [1760, .065, .13, .035]],
  prize: [[2093, 0, .035, .025], [2637, .04, .04, .02], [3136, .08, .05, .016]],
  stop: [[110, 0, .075, .065, "triangle", 58], [880, 0, .045, .023], [1320, .018, .04, .01]],
  reach: [[392, 0, .15, .045], [523.25, .13, .15, .045], [783.99, .26, .38, .045], [1046.5, .26, .38, .02]],
  super: [[196, 0, .5, .045, "sawtooth", 392], [523.25, .1, .15], [659.25, .22, .15], [783.99, .34, .15], [1046.5, .46, .42]],
  pitch: [[740, 0, .3, .035, "sine", 130]],
  swing: [[130, 0, .2, .065, "triangle", 1046], [1568, .07, .14, .025]],
  push: [[82.4, 0, .24, .085, "triangle", 41.2], [587.33, .02, .1], [880, .1, .15], [1174.66, .2, .3]],
  miss: [[392, 0, .17, .025], [329.63, .12, .17, .025], [246.94, .24, .3, .022]],
  revival: [[130.81, 0, .5, .04, "sawtooth", 523.25], [392, .16, .15], [523.25, .29, .15], [783.99, .42, .15], [1046.5, .55, .45]],
  jackpot: [[261.63, 0, .22, .05], [523.25, 0, .22], [659.25, 0, .22], [392, .23, .22], [783.99, .23, .22], [523.25, .46, .25], [1046.5, .46, .25], [659.25, .73, .65], [783.99, .73, .65], [1046.5, .73, .65], [1568, .73, .65, .015]],
  bonus: [[523.25, 0, .11], [659.25, .09, .11], [783.99, .18, .11], [1046.5, .27, .26]],
  rush: [[440, 0, .12], [554.37, .1, .12], [659.25, .2, .12], [880, .3, .3], [1108.73, .3, .3, .02]],
  "rush-end": [[440, 0, .2, .022], [329.63, .2, .2, .022], [220, .4, .35, .022]],
  empty: [[220, 0, .09, .024], [220, .17, .09, .024]],
  "stop-fire": [[160, 0, .045, .025, "triangle", 65]],
};

/** Mechanical foley and original fanfares, synthesized locally. No context is
 * created or resumed until the player opts in through a direct gesture. */
export function usePachinkoAudio() {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolumeState] = useState(.45);
  const enabledRef = useRef(false);
  const volumeRef = useRef(.45);
  const alive = useRef(true);
  const output = useRef<Output | null>(null);
  const voices = useRef(new Set<Voice>());
  const bed = useRef<Voice[]>([]);
  const desiredBed = useRef<PachinkoAmbience>("off");
  const activeBed = useRef<PachinkoAmbience>("off");
  const speech = useRef<SpeechSynthesisUtterance | null>(null);
  const lastPin = useRef(-Infinity);

  const release = useCallback((voice: Voice) => {
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* Already ended. */ }
    for (const node of voice.nodes) { try { node.disconnect(); } catch { /* Closed graph. */ } }
    voices.current.delete(voice);
  }, []);

  const stopBed = useCallback(() => {
    for (const voice of bed.current) release(voice);
    bed.current = [];
    activeBed.current = "off";
  }, [release]);

  const syncBed = useCallback(() => {
    const graph = output.current;
    const mode = desiredBed.current;
    if (!enabledRef.current || !graph || graph.context.state !== "running" || document.hidden || mode === "off") {
      stopBed(); return;
    }
    if (activeBed.current === mode) return;
    stopBed(); activeBed.current = mode;
    const frequencies = mode === "bonus" ? [130.81, 196] : mode === "rush" ? [110, 164.81] : [43, 72];
    try {
      for (const [index, frequency] of frequencies.entries()) {
        const source = graph.context.createOscillator();
        const gain = graph.context.createGain();
        bed.current.push({ source, nodes: [source, gain] });
        source.type = index ? "sine" : "triangle";
        source.frequency.value = frequency;
        gain.gain.value = mode === "normal" ? .006 : .009;
        source.connect(gain); gain.connect(graph.master); source.start();
      }
    } catch { stopBed(); }
  }, [stopBed]);

  const stopAll = useCallback(() => {
    stopBed();
    for (const voice of [...voices.current]) release(voice);
    if (speech.current) {
      speech.current.onend = speech.current.onerror = null;
      speech.current = null;
      try { window.speechSynthesis?.cancel(); } catch { /* Optional speech. */ }
    }
  }, [release, stopBed]);

  const disable = useCallback(() => {
    enabledRef.current = false;
    if (alive.current) setEnabled(false);
    stopAll();
  }, [stopAll]);

  const unlock = useCallback(() => {
    if (!alive.current || !enabledRef.current || typeof window === "undefined") return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    let initializing: AudioContext | null = null;
    try {
      if (!output.current || output.current.context.state === "closed") {
        const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) { disable(); return; }
        const context = new Constructor();
        initializing = context;
        const master = context.createGain();
        const compressor = context.createDynamicsCompressor();
        master.gain.value = volumeRef.current * .65;
        compressor.threshold.value = -14; compressor.knee.value = 18; compressor.ratio.value = 5;
        compressor.attack.value = .003; compressor.release.value = .16;
        master.connect(compressor); compressor.connect(context.destination);
        const noise = context.createBuffer(1, Math.ceil(context.sampleRate * .3), context.sampleRate);
        const samples = noise.getChannelData(0);
        let seed = 0x5967;
        for (let index = 0; index < samples.length; index++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[index] = (seed / 0x100000000 * 2 - 1) * Math.exp(-index / (samples.length * .23));
        }
        output.current = { context, master, compressor, noise };
        initializing = null;
      }
      const graph = output.current;
      if (graph.context.state === "suspended") {
        void graph.context.resume().then(() => { if (alive.current && output.current === graph) syncBed(); }).catch(disable);
      } else syncBed();
    } catch {
      if (initializing && initializing.state !== "closed") { try { void initializing.close().catch(() => {}); } catch { /* Device failed during setup. */ } }
      disable();
    }
  }, [disable, syncBed]);

  const toggleSound = useCallback(() => {
    if (!alive.current) return;
    if (enabledRef.current) { disable(); return; }
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    enabledRef.current = true; setEnabled(true); unlock();
  }, [disable, unlock]);

  const setVolume = useCallback((next: number) => {
    if (!Number.isFinite(next)) return;
    const value = Math.max(0, Math.min(1, next));
    volumeRef.current = value;
    if (alive.current) setVolumeState(value);
    const graph = output.current;
    if (graph && graph.context.state !== "closed") graph.master.gain.setTargetAtTime(value * .65, graph.context.currentTime, .02);
    if (value === 0 && speech.current) {
      speech.current.onend = speech.current.onerror = null;
      speech.current = null;
      try { window.speechSynthesis?.cancel(); } catch { /* Optional speech. */ }
    }
  }, []);

  const setAmbience = useCallback((mode: PachinkoAmbience) => {
    desiredBed.current = mode; syncBed();
  }, [syncBed]);

  const play = useCallback((cue: PachinkoCue) => {
    const graph = output.current;
    if (!alive.current || !enabledRef.current || !graph || graph.context.state !== "running" || document.hidden) return;
    const context = graph.context;
    if (cue === "pin") {
      if (context.currentTime - lastPin.current < .07) return;
      lastPin.current = context.currentTime;
    }
    const start = context.currentTime + .004;
    try {
    for (const [frequency, offset, duration, level = .035, wave = "triangle", slide] of CUES[cue]) {
      if (voices.current.size >= 48) break;
      const source = context.createOscillator();
      const gain = context.createGain();
      const at = start + offset;
      source.type = wave; source.frequency.setValueAtTime(frequency, at);
      if (slide) source.frequency.exponentialRampToValueAtTime(slide, at + duration);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(level, at + .004);
      gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
      source.connect(gain); gain.connect(graph.master);
      const voice: Voice = { source, nodes: [source, gain] };
      voices.current.add(voice);
      source.onended = () => release(voice);
      source.start(at); source.stop(at + duration + .01);
    }
    if (["launch", "stop", "push", "swing"].includes(cue) && voices.current.size < 48) {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = graph.noise; filter.type = "highpass";
      filter.frequency.value = cue === "launch" ? 3100 : cue === "push" ? 450 : 1700;
      gain.gain.setValueAtTime(cue === "push" ? .07 : .025, start);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .15);
      source.connect(filter); filter.connect(gain); gain.connect(graph.master);
      const voice: Voice = { source, nodes: [source, filter, gain] };
      voices.current.add(voice);
      source.onended = () => release(voice);
      source.start(start); source.stop(start + .18);
    }
    } catch { disable(); }
  }, [disable, release]);

  const shoutSeven = useCallback(() => {
    if (!alive.current || !enabledRef.current || volumeRef.current === 0 || document.hidden || speech.current) return;
    try {
      const synthesis = window.speechSynthesis;
      if (!synthesis || typeof window.SpeechSynthesisUtterance !== "function" || synthesis.speaking || synthesis.pending) return;
      const utterance = new SpeechSynthesisUtterance("カイリキー！！");
      utterance.lang = "ja-JP"; utterance.rate = 1.05; utterance.pitch = .85; utterance.volume = volumeRef.current * .7;
      utterance.onend = utterance.onerror = () => { if (speech.current === utterance) speech.current = null; };
      speech.current = utterance; synthesis.speak(utterance);
    } catch { speech.current = null; }
  }, []);

  useEffect(() => {
    alive.current = true;
    const visibility = () => { if (document.hidden) stopAll(); else syncBed(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive.current = false; enabledRef.current = false; stopAll();
      document.removeEventListener("visibilitychange", visibility);
      const graph = output.current; output.current = null;
      if (graph && graph.context.state !== "closed") { try { void graph.context.close().catch(() => {}); } catch { /* Already closed. */ } }
    };
  }, [stopAll, syncBed]);

  return { enabled, volume, setVolume, toggleSound, unlock, play, shoutSeven, setAmbience, stopAll };
}
