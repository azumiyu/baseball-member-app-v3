"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createEntityId } from "@/lib/entity-id";
import type { GameSnapshot } from "@/lib/games/api-types";
import { ROYALE, advanceRoyale, royaleCanDeploy, type RoyaleInput, type RoyaleState } from "@/lib/games/yg-royale";
import { useGameApi, type GameAction } from "./useGameApi";

type Session = {
  runId: string; turn: number; base: RoyaleState; view: RoyaleState;
  inputs: RoyaleInput[]; queued: RoyaleInput | null; paused: boolean;
  pauseReason: "manual" | "hidden" | "auth" | null;
  lastTime: number; remainder: number; sending: boolean; needsRetry: boolean;
  forceSave: boolean; pending: GameAction | null; pendingExpected: RoyaleState | null; retryCount: number;
};

// Worker JSON property order and tiny floating-point differences are not a
// different battle. Integer counters and all structural data must still match.
function sameBattle(left: unknown, right: unknown, field = ""): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left === "number" && typeof right === "number") {
    return ["x", "y", "tx", "ty", "elixir", "damageScale"].includes(field)
      && Number.isFinite(left) && Number.isFinite(right)
      && Math.abs(left - right) <= 1e-10 + Math.max(Math.abs(left), Math.abs(right)) * 1e-12;
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameBattle(value, right[index]));
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a).filter(key => a[key] !== undefined);
  return keys.length === Object.keys(b).filter(key => b[key] !== undefined).length
    && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameBattle(a[key], b[key], key));
}

/** Predict the shared deterministic simulation locally, then confirm only
 * input batches with the server. No frame, unit, attack, or card makes a request. */
export function useYgRoyaleGame() {
  const api = useGameApi<RoyaleState>(ROYALE.gameId);
  const [view, setView] = useState<RoyaleState | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sessionKey, setSessionKey] = useState("");
  const [notice, setNotice] = useState("");
  const [inputNotice, setInputNotice] = useState("");
  const [awaitingSave, setAwaitingSave] = useState(false);
  const session = useRef<Session | null>(null);
  const alive = useRef(false);
  const requestLock = useRef(false);
  const flushRef = useRef<(retry?: boolean) => void>(() => {});
  const pauseRef = useRef<(automatic?: boolean) => void>(() => {});
  const visibleRef = useRef<() => void>(() => {});
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = api.snapshot?.run;
  const savedState = run?.lastResult?.kind === "yg-royale" ? run.lastResult : null;
  const state = view ?? savedState;
  const ended = state?.status === "finished";
  const saved = Boolean(ended && run?.status === "finished" && savedState?.tick === state.tick);

  function clearRetry() {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }

  function scheduleRetry(active: Session) {
    clearRetry();
    if (!alive.current || session.current !== active || !active.needsRetry || document.hidden
      || active.pauseReason === "hidden" || active.pauseReason === "auth") return;
    const delay = Math.min(8000, 1000 * 2 ** Math.min(3, Math.max(0, active.retryCount - 1)));
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      if (alive.current && session.current === active && !document.hidden) flushRef.current(true);
    }, delay);
  }

  function adopt(snapshot: GameSnapshot<RoyaleState>, message = "") {
    clearRetry();
    session.current = null;
    setSessionKey(""); setPlaying(false); setAwaitingSave(false);
    setView(snapshot.run?.lastResult?.kind === "yg-royale" ? snapshot.run.lastResult : null);
    setNotice(message); setInputNotice("");
  }

  async function flush(retry = false) {
    const active = session.current;
    if (!active || active.sending || (active.needsRetry && !retry)) return;
    const behind = active.view.tick - active.base.tick;
    if (!active.pending && (behind <= 0 || (behind < ROYALE.maxChunkTicks && active.view.status !== "finished" && !active.forceSave))) return;
    const toTick = Math.min(active.view.tick, active.base.tick + ROYALE.maxChunkTicks);
    const inputs = active.inputs.filter(input => input.tick <= toTick);
    // A retry confirms the original checkpoint, even while local prediction has
    // advanced. Recomputing its expectation at the current tick causes a false
    // conflict after a lost response or a partially saved manual pause.
    const expected = active.pendingExpected ?? advanceRoyale(active.base, inputs, toTick);
    const action = active.pending ?? { action: "royale-step", gameId: ROYALE.gameId,
      requestId: createEntityId(), runId: active.runId, turn: active.turn, toTick, inputs };
    clearRetry();
    active.pendingExpected = expected;
    active.pending = action; active.sending = true; active.needsRetry = false;
    setAwaitingSave(true);
    const next = await api.act(action);
    if (!alive.current || session.current !== active) return;
    active.sending = false;
    if (!next) {
      active.needsRetry = true; active.retryCount += 1;
      setNotice(active.retryCount >= 3
        ? "通信が不安定です。自動で保存を再試行しています。保存待ちが長くなると、進行だけ一時的に待ちます。"
        : "通信を再試行しています。バトルはそのまま続けられます。");
      scheduleRetry(active);
      return;
    }
    const confirmed = next.run?.lastResult;
    if (!next.run || next.run.id !== active.runId || confirmed?.kind !== "yg-royale" ||
      next.run.turn !== active.turn + 1 || !sameBattle(confirmed, expected)) {
      adopt(next, "保存されたバトルに合わせました。「再開」で続けられます。");
      return;
    }
    active.pending = null; active.pendingExpected = null; active.retryCount = 0;
    active.base = confirmed; active.turn = next.run.turn;
    active.inputs = active.inputs.filter(input => input.tick > confirmed.tick);
    if (confirmed.status === "finished") {
      active.paused = true; active.view = confirmed; active.queued = null;
      setView(confirmed); setPlaying(false); setNotice("");
    } else {
      // Continue from the authoritative numeric values without discarding any
      // already displayed inputs. A partial checkpoint may leave two chunks.
      const predictedTick = active.view.tick;
      let rebased = confirmed;
      try {
        while (rebased.tick < predictedTick && rebased.status === "playing") {
          const end = Math.min(predictedTick, rebased.tick + ROYALE.maxChunkTicks);
          rebased = advanceRoyale(rebased, active.inputs.filter(input => input.tick > rebased.tick && input.tick <= end), end);
        }
      } catch {
        adopt(next, "保存されたバトルに合わせました。「再開」で続けられます。");
        return;
      }
      active.view = rebased;
      setView(rebased);
      if (active.base.tick === active.view.tick) active.forceSave = false;
      setNotice("");
    }
    setAwaitingSave(false);
    flushRef.current();
  }

  function activate(current: RoyaleState, runId: string, turn: number) {
    session.current = { runId, turn, base: current, view: current, inputs: [], queued: null,
      paused: false, pauseReason: null, lastTime: performance.now(), remainder: 0, sending: false,
      needsRetry: false, forceSave: false, pending: null, pendingExpected: null, retryCount: 0 };
    setView(current); setPlaying(true); setSessionKey(createEntityId());
    setNotice(""); setInputNotice(""); setAwaitingSave(false);
  }

  const deploy = useCallback((slot: number, x: number, y: number) => {
    const active = session.current;
    if (!active || active.paused || active.view.status !== "playing") return false;
    if (active.queued) { setInputNotice("部隊を配置中です。次の一瞬を待ってください。"); return false; }
    const targetX = Math.round(x), targetY = Math.round(y);
    if (!royaleCanDeploy(active.view, slot, targetX, targetY)) {
      setInputNotice("コストをためて、自陣の光っているエリアに配置しよう。"); return false;
    }
    active.queued = { tick: active.view.tick + 1, slot, x: targetX, y: targetY };
    setInputNotice("");
    return true;
  }, []);

  function pauseSession(automatic = false) {
    const active = session.current;
    if (!active || active.view.status !== "playing") return;
    if (automatic && active.paused) return;
    active.paused = true; active.pauseReason = automatic ? "hidden" : "manual";
    active.queued = null; active.forceSave = true;
    if (automatic) clearRetry();
    setPlaying(false); setInputNotice(""); flushRef.current();
  }
  function pause() { pauseSession(); }
  function resume() {
    if (api.busy || api.retryPending || ended) return;
    const active = session.current;
    if (active) {
      if (active.needsRetry || active.sending) return;
      active.paused = false; active.pauseReason = null; active.forceSave = false;
      active.lastTime = performance.now(); active.remainder = 0;
      setPlaying(true); setNotice(""); setInputNotice("");
    } else if (savedState && run) activate(savedState, run.id, run.turn);
  }
  function visible() {
    const active = session.current;
    if (!active || document.hidden) return;
    active.lastTime = performance.now(); active.remainder = 0;
    if (active.pauseReason === "hidden" && active.view.status === "playing") {
      active.paused = false; active.pauseReason = null; active.forceSave = false; setPlaying(true);
    }
    if (active.needsRetry) scheduleRetry(active);
  }
  async function start(deck: readonly string[]) {
    if (requestLock.current || api.busy || api.retryPending || playing || awaitingSave || (ended && !saved)) return;
    requestLock.current = true;
    try {
      const next = await api.act({ action: "start", gameId: ROYALE.gameId, requestId: createEntityId(),
        runId: run?.id ?? null, turn: run?.turn ?? 0, deck: [...deck] });
      if (!alive.current) return;
      if (next?.run?.lastResult?.kind === "yg-royale" && next.run.status === "playing") activate(next.run.lastResult, next.run.id, next.run.turn);
    } finally { requestLock.current = false; }
  }
  async function retry() {
    if (session.current?.sending) return;
    if (session.current?.needsRetry) { clearRetry(); await flush(true); return; }
    if (requestLock.current) return;
    requestLock.current = true;
    try {
      const next = api.retryPending ? await api.act() : await api.read();
      if (!alive.current || !next) return;
      adopt(next, "保存されたバトルを読み込みました。");
    } finally { requestLock.current = false; }
  }

  useEffect(() => {
    flushRef.current = retry => { void flush(retry); }; pauseRef.current = pauseSession; visibleRef.current = visible;
  });
  useEffect(() => {
    if (!api.unauthorized) return;
    const active = session.current;
    if (!active) return;
    active.paused = true; active.pauseReason = "auth"; active.queued = null;
    clearRetry(); setPlaying(false); setAwaitingSave(false);
    setNotice("ログイン状態を確認してください。バトルを安全に停止しました。");
  }, [api.unauthorized]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; clearRetry();
      if (hiddenTimer.current !== null) clearTimeout(hiddenTimer.current);
      hiddenTimer.current = null;
      if (session.current) { session.current.paused = true; session.current.queued = null; }
    };
  }, []);

  useEffect(() => {
    const active = session.current;
    if (!sessionKey || !playing || !active) return;
    let frame = 0;
    const tick = (now: number) => {
      if (session.current !== active || active.paused || active.view.status !== "playing") return;
      if (document.hidden) {
        active.lastTime = now; active.remainder = 0;
        frame = requestAnimationFrame(tick); return;
      }
      // A slow tab never jumps an entire hidden interval. Hidden/pagehide also
      // pauses explicitly. Bound prediction if a checkpoint is still in flight.
      active.remainder += Math.max(0, Math.min(300, now - active.lastTime));
      active.lastTime = now;
      let steps = 0, changed = false;
      while (active.remainder >= ROYALE.stepMs && steps < 6 && active.view.status === "playing" && active.view.tick - active.base.tick < ROYALE.maxChunkTicks * 2) {
        const nextTick = active.view.tick + 1;
        const queued = active.queued?.tick === nextTick ? active.queued : null;
        active.queued = null;
        const inputs = queued && royaleCanDeploy(active.view, queued.slot, queued.x, queued.y) ? [queued] : [];
        active.inputs.push(...inputs);
        active.view = advanceRoyale(active.view, inputs, nextTick);
        active.remainder -= ROYALE.stepMs; steps++; changed = true;
      }
      if (active.view.tick - active.base.tick >= ROYALE.maxChunkTicks * 2) {
        active.remainder = 0;
        setNotice("保存待ちです。通信が戻るとバトルが自動で進みます。");
      }
      if (changed) setView(active.view);
      if (active.view.status === "finished") { active.paused = true; active.queued = null; setPlaying(false); }
      flushRef.current();
      if (!active.paused) frame = requestAnimationFrame(tick);
    };
    active.lastTime = performance.now();
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sessionKey, playing]);

  useEffect(() => {
    const clearHidden = () => {
      if (hiddenTimer.current !== null) clearTimeout(hiddenTimer.current);
      hiddenTimer.current = null;
    };
    const visibility = () => {
      clearHidden();
      if (document.hidden) {
        clearRetry();
        hiddenTimer.current = setTimeout(() => {
          hiddenTimer.current = null;
          if (alive.current && document.hidden) pauseRef.current(true);
        }, 200);
      } else visibleRef.current();
    };
    const pagehide = () => { clearHidden(); clearRetry(); pauseRef.current(true); };
    const pageshow = () => { clearHidden(); if (!document.hidden) visibleRef.current(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);
    return () => {
      clearHidden(); document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide); window.removeEventListener("pageshow", pageshow);
    };
  }, []);

  return { api, state, playing, ended, saved, awaitingSave, notice, inputNotice,
    start, resume, pause, deploy, retry, hasSession: Boolean(sessionKey) };
}
