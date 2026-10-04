"use client";

/* eslint-disable @next/next/no-img-element -- Local game character artwork. */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowDownUp, ChevronDown, Heart, Pause, Play, RotateCcw, Shield } from "lucide-react";
import { createEntityId } from "@/lib/entity-id";
import type { GameSnapshot } from "@/lib/games/api-types";
import { DODGE, advanceDodge, dodgeDifficulty, dodgeObjectType, type DodgeMove, type DodgeState } from "@/lib/games/shibata-dodge";
import { GameLeaderboard } from "./GameLeaderboard";
import { GameAccessState, GameShell } from "./GameShell";
import { useGameApi, type GameAction } from "./useGameApi";
import shared from "./Games.module.css";
import styles from "./ShibataDodge.module.css";

const GAME_ID = "shibata-dodge";
type Session = { runId: string; turn: number; base: DodgeState; view: DodgeState; moves: DodgeMove[]; targetY: number; paused: boolean; lastTime: number; remainder: number; sending: boolean; needsRetry: boolean; forceSave: boolean; pending: GameAction | null };
const effectLabels = { none: "", freeze: "足が凍った！ 1 秒ストップ！", invincible: "芝田、無敵モード！！", heal: "HP 回復！ まだまだいける！", stones: "危険！ ボールが全部、石に！" };
const time = (tick: number) => (tick * DODGE.stepMs / 1000).toFixed(1);

export function ShibataDodgePage() {
  const api = useGameApi<DodgeState>(GAME_ID);
  const [view, setView] = useState<DodgeState | null>(null);
  const [sessionKey, setSessionKey] = useState("");
  const [playing, setPlaying] = useState(false);
  const [bestBefore, setBestBefore] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [scoreCue, setScoreCue] = useState<{ tick: number; score: number; amount: number; milestone: boolean } | null>(null);
  const active = useRef<Session | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; startY: number; playerY: number } | null>(null);
  const keys = useRef(new Set<string>());
  const alive = useRef(false);
  const flushRef = useRef<() => void>(() => {});
  const pauseRef = useRef<() => void>(() => {});
  const run = api.snapshot?.run;
  const savedState = run?.lastResult?.kind === "shibata-dodge" ? run.lastResult : null;
  const state = view ?? savedState;
  const ended = state?.status === "finished";
  const saved = Boolean(ended && run?.status === "finished" && savedState?.tick === state.tick);

  function stopInput() {
    pointer.current = null;
    keys.current.clear();
    if (active.current) active.current.targetY = active.current.view.y;
  }

  function stopKeyboardInput() {
    keys.current.clear();
    if (!pointer.current && active.current) active.current.targetY = active.current.view.y;
  }

  function focusForKeyboard() {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) field.current?.focus({ preventScroll: true });
  }

  function adopt(snapshot: GameSnapshot<DodgeState>, message = "") {
    active.current = null;
    stopInput();
    setSessionKey("");
    setPlaying(false);
    setView(snapshot.run?.lastResult ?? null);
    setBestBefore(null);
    setNotice(message);
    setScoreCue(null);
  }

  async function flush(retry = false) {
    const session = active.current;
    if (!session || session.sending || (session.needsRetry && !retry)) return;
    const behind = session.view.tick - session.base.tick;
    if (!session.pending && (behind <= 0 || (behind < DODGE.maxChunkTicks && session.view.status !== "finished" && !session.forceSave))) return;
    const toTick = Math.min(session.view.tick, session.base.tick + DODGE.maxChunkTicks);
    const moves = session.moves.filter(move => move.tick <= toTick);
    const expected = advanceDodge(session.base, moves, toTick);
    const request = session.pending ?? { action: "dodge-step", gameId: GAME_ID, requestId: createEntityId(), runId: session.runId, turn: session.turn, toTick, moves };
    session.pending = request;
    session.sending = true;
    session.needsRetry = false;
    const next = await api.act(request);
    if (!alive.current || active.current !== session) return;
    session.sending = false;
    if (!next) {
      session.needsRetry = true;
      session.paused = true;
      stopInput();
      setPlaying(false);
      setNotice("通信が止まったため一時停止しました。再試行して続けられます。");
      return;
    }
    const confirmed = next.run?.lastResult;
    if (!next.run || next.run.id !== session.runId || !confirmed || confirmed.kind !== "shibata-dodge" || next.run.turn !== session.turn + 1 || JSON.stringify(confirmed) !== JSON.stringify(expected)) {
      adopt(next, "保存された状態に合わせました。続きから再開できます。");
      return;
    }
    session.pending = null;
    session.base = confirmed;
    session.turn = next.run.turn;
    session.moves = session.moves.filter(move => move.tick > confirmed.tick);
    if (confirmed.status === "finished") {
      session.paused = true;
      session.view = confirmed;
      setView(confirmed);
      setPlaying(false);
      setNotice("");
    } else if (session.base.tick === session.view.tick) {
      session.forceSave = false;
      setNotice("");
    }
    flushRef.current();
  }

  function pause() {
    const session = active.current;
    if (!session || session.paused || session.view.status === "finished") return;
    session.paused = true;
    session.forceSave = true;
    stopInput();
    setPlaying(false);
    flushRef.current();
  }

  function activate(current: DodgeState, runId: string, turn: number) {
    active.current = { runId, turn, base: current, view: current, moves: [], targetY: current.y, paused: false, lastTime: performance.now(), remainder: 0, sending: false, needsRetry: false, forceSave: false, pending: null };
    setBestBefore(api.snapshot?.personalBest?.score ?? null);
    setView(current);
    setPlaying(true);
    setNotice("");
    setScoreCue(null);
    setSessionKey(createEntityId());
    focusForKeyboard();
  }

  function resume() {
    if (api.busy || api.retryPending || ended) return;
    const session = active.current;
    if (session) {
      if (session.needsRetry) return;
      session.paused = false;
      session.lastTime = performance.now();
      setPlaying(true);
      setNotice("");
      focusForKeyboard();
    } else if (savedState && run) activate(savedState, run.id, run.turn);
  }

  async function start() {
    if (api.busy || api.retryPending || playing || (ended && !saved)) return;
    const next = await api.act({ action: "start", gameId: GAME_ID, requestId: createEntityId(), runId: run?.id ?? null, turn: run?.turn ?? 0 });
    if (next?.run?.lastResult?.kind === "shibata-dodge" && next.run.status === "playing") activate(next.run.lastResult, next.run.id, next.run.turn);
  }

  async function retry() {
    if (active.current?.needsRetry) { await flush(true); return; }
    if (api.retryPending) {
      const next = await api.act();
      if (next?.run?.lastResult?.kind === "shibata-dodge" && next.run.status === "playing") activate(next.run.lastResult, next.run.id, next.run.turn);
      else if (next) adopt(next);
    } else {
      const next = await api.read();
      if (next) adopt(next);
    }
  }

  useEffect(() => { flushRef.current = () => { void flush(); }; pauseRef.current = pause; });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (active.current) active.current.paused = true; };
  }, []);

  useEffect(() => {
    const session = active.current;
    if (!sessionKey || !session) return;
    let raf = 0;
    const tick = () => {
      if (active.current !== session) return;
      const now = performance.now();
      if (!session.paused && session.view.status === "playing") {
        const previousScore = session.view.score;
        session.remainder += now - session.lastTime;
        let count = 0;
        while (session.remainder >= DODGE.stepMs && session.view.status === "playing" && count < DODGE.maxChunkTicks) {
          const nextTick = session.view.tick + 1;
          const targetY = Math.round(session.targetY);
          const moves = targetY !== session.view.targetY ? [{ tick: nextTick, y: targetY }] : [];
          session.moves.push(...moves);
          session.view = advanceDodge(session.view, moves, nextTick);
          session.remainder -= DODGE.stepMs;
          count += 1;
        }
        if (session.view.score > previousScore) {
          const cue = { tick: session.view.tick, score: session.view.score, amount: session.view.score - previousScore, milestone: Math.floor(session.view.score / 10) > Math.floor(previousScore / 10) };
          setScoreCue(previous => previous?.milestone && cue.tick - previous.tick < 40 && !cue.milestone ? previous : cue);
        }
        setView(session.view);
        if (session.view.status === "finished") {
          session.paused = true;
          stopInput();
          setPlaying(false);
        }
        flushRef.current();
      }
      session.lastTime = now;
      raf = requestAnimationFrame(tick);
    };
    const onVisibility = () => { if (document.hidden) pauseRef.current(); };
    // LINE の WebView は表示中のスワイプでも blur を送るため、非表示だけで停止する。
    const onBlur = () => stopKeyboardInput();
    const onPageHide = () => pauseRef.current();
    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [sessionKey]);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    const session = active.current;
    if (!session || session.paused || !event.isPrimary || event.button !== 0 || pointer.current) return;
    event.preventDefault();
    keys.current.clear();
    if (event.pointerType === "mouse") field.current?.focus({ preventScroll: true });
    pointer.current = { id: event.pointerId, startY: event.clientY, playerY: session.view.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = pointer.current;
    const session = active.current;
    if (!drag || !session || drag.id !== event.pointerId || session.paused) return;
    event.preventDefault();
    const height = event.currentTarget.getBoundingClientRect().height;
    if (height <= 0) return;
    session.targetY = Math.max(DODGE.playerMinY, Math.min(DODGE.playerMaxY, drag.playerY + (event.clientY - drag.startY) / height * DODGE.world));
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current?.id !== event.pointerId) return;
    stopInput();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>, pressed: boolean) {
    const key = event.key.toLowerCase();
    if (!["arrowup", "arrowdown", "w", "s"].includes(key)) return;
    event.preventDefault();
    const session = active.current;
    if (!session || session.paused || pointer.current) return;
    if (pressed) keys.current.add(key); else keys.current.delete(key);
    const up = keys.current.has("arrowup") || keys.current.has("w");
    const down = keys.current.has("arrowdown") || keys.current.has("s");
    session.targetY = up === down ? session.view.y : up ? DODGE.playerMinY : DODGE.playerMaxY;
  }

  if (api.loading || api.unauthorized || !api.snapshot) return <GameShell isGame><GameAccessState loading={api.loading} unauthorized={api.unauthorized} error={api.error} onRetry={() => { void api.read(); }} /></GameShell>;

  const hp = state?.hp ?? DODGE.maxHp;
  const tick = state?.tick ?? 0;
  const frozen = Boolean(state && state.frozenUntil > tick);
  const invincible = Boolean(state && state.invincibleUntil > tick);
  const stones = Boolean(state && state.stonesUntil > tick);
  const hit = Boolean(state && state.hitUntil > tick);
  const effect = state && state.lastEffect !== "none" && tick - state.effectAt < 70 ? state.lastEffect === "heal" && hp === DODGE.maxHp ? "HP 満タン！ まだまだいける！" : effectLabels[state.lastEffect] : "";
  const { level, seconds } = dodgeDifficulty(tick);
  const remaining = (until: number) => `${Math.max(0, (until - tick) * DODGE.stepMs / 1000).toFixed(1)}s`;
  const score = state?.score ?? 0;
  const best = api.snapshot.personalBest?.score ?? 0;
  const above = api.snapshot.leaderboard.filter(entry => entry.playerId !== api.snapshot!.member.id && entry.score >= Math.max(best, score)).at(-1);
  const critical = hp > 0 && hp <= 2 && !invincible;
  const direction = playing && !frozen && state && Math.abs(state.targetY - state.y) > 2 ? state.targetY < state.y ? "up" : "down" : "still";
  const record = Boolean(ended && sessionKey && score > (bestBefore ?? 0));
  const title = score >= 200 ? "死球回避の伝説" : score >= 100 ? "当たらない男・芝田" : score >= 60 ? "見切りの達人" : score >= 30 ? "ひらり、かわし職人" : score >= 10 ? "ナイス身のこなし！" : "ここからが本番！";

  return <GameShell isGame memberName={api.snapshot.member.name}>
    <div className={`${shared.gameHeading} ${styles.heading}`}><p>SHIBATA’S DEAD BALL SURVIVAL</p><h1>芝田の<span>避けろ！死球！！</span></h1><small>動けるのは、上下だけ。最後まで立っていろ！</small></div>
    <section className={`${shared.machine} ${styles.machine}`} data-invincible={invincible} data-critical={critical} data-playing={playing} aria-label="芝田の死球回避ゲーム">
      <div className={styles.scoreboard}><div><span>避けたボール</span><strong key={scoreCue?.tick ?? score} className={styles.scoreValue}>{score.toLocaleString("ja-JP")}<small>球</small></strong><small className={styles.bestTarget}>MY BEST {best.toLocaleString("ja-JP")} 球</small></div><div className={styles.health} data-critical={critical} aria-label={`体力 ${hp} / ${DODGE.maxHp}`}><span>{invincible ? "無敵！ いまがチャンス" : critical ? "踏ん張れ、芝田！" : "SHIBATA HP"}</span><div>{Array.from({ length: DODGE.maxHp }, (_, i) => <Heart key={i} size={21} fill={i < hp ? "currentColor" : "none"} data-empty={i >= hp} aria-hidden="true" />)}</div></div></div>
      <div className={styles.levelProgress} aria-hidden="true"><span style={{ width: `${seconds % 15 / 15 * 100}%` }} /></div>
      <div className={styles.field} ref={field} role="application" aria-label="上下にスワイプ、または上下矢印・W・Sキーで芝田を動かす" tabIndex={0} data-frozen={frozen} data-hit={hit} data-invincible={invincible} data-stones={stones} data-intensity={Math.min(3, level)} data-playing={playing} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} onKeyDown={event => keyboard(event, true)} onKeyUp={event => keyboard(event, false)} onBlur={stopKeyboardInput} onContextMenu={event => event.preventDefault()}>
        <div className={styles.fieldLines} aria-hidden="true" />
        <div className={styles.speedLines} aria-hidden="true" />
        <div className={styles.fieldTop}><span>LEVEL {level}</span><span>{time(tick)} 秒</span></div>
        <div className={styles.dangerLane} aria-hidden="true">飛来注意<span>← ← ←</span></div>
        <div className={styles.player} style={{ left: `${DODGE.playerX / 10}%`, top: `${(state?.y ?? 500) / 10}%` }} data-invincible={invincible} data-frozen={frozen} data-hit={hit} data-moving={direction}>
          <img src="/game/shibata_yokeru.PNG" alt={!invincible ? "死球を避ける芝田" : ""} aria-hidden={invincible} data-visible={!invincible} draggable={false} />
          <img src="/game/shibata_muteki.PNG" alt={invincible ? "無敵になった芝田" : ""} aria-hidden={!invincible} data-visible={invincible} draggable={false} />
          {invincible && <Shield className={styles.shield} aria-hidden="true" />}
          {frozen && <span className={styles.ice} aria-hidden="true">❄</span>}
          {hit && <strong className={styles.ouch}>イテッ！</strong>}
        </div>
        <i className={styles.hitArea} style={{ left: `${DODGE.playerX / 10}%`, top: `${(state?.y ?? 500) / 10}%`, width: `${DODGE.playerRadiusX / 5}%`, height: `${DODGE.playerRadiusY / 5}%` }} aria-hidden="true" />
        {state?.objects.map(object => {
          const type = dodgeObjectType(object, state);
          const radius = type === "ball" ? DODGE.ballRadius : type === "stone" ? DODGE.stoneRadius : DODGE.pickupRadius;
          return <span key={object.id} className={styles.object} data-type={type} style={{ left: `${object.x / 10}%`, top: `${object.y / 10}%`, width: `${radius / 5}%`, height: `${radius / 5}%` }} aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {type === "ball" ? <><circle cx="50" cy="50" r="47" fill="#fff7e7" stroke="#bfbdb2" strokeWidth="5" /><path d="M24 8Q61 50 24 92M76 8Q39 50 76 92" fill="none" stroke="#c63c34" strokeWidth="7" strokeDasharray="5 5" /></> : type === "stone" ? <><path d="M26 4 77 9 97 45 80 88 33 98 4 61 9 25Z" fill="#92928e" stroke="#d3cbb8" strokeWidth="5" /><path d="M9 25 38 32 55 71 80 88M38 32 77 9" fill="none" stroke="#5b5d5c" strokeWidth="5" /></> : type === "heart" ? <path d="M50 91C34 77 4 54 4 29C4 3 38-2 50 23C62-2 96 3 96 29C96 54 66 77 50 91Z" fill="#ff708e" stroke="#ffd3dc" strokeWidth="5" /> : <><rect x="4" y="4" width="92" height="92" rx="12" fill="#f6c653" stroke="#fff4bf" strokeWidth="6" /><text x="50" y="80" textAnchor="middle" fontSize="86" fontWeight="900" fill="#573426">?</text></>}
          </svg></span>;
        })}
        <div className={styles.effects} aria-label="特殊効果の残り時間">{frozen && <span className={styles.freezeBadge}>凍結 {remaining(state!.frozenUntil)}</span>}{invincible && <span className={styles.invincibleBadge}>無敵 {remaining(state!.invincibleUntil)}</span>}{stones && <span className={styles.stoneBadge}>石化 {remaining(state!.stonesUntil)}</span>}</div>
        {effect && <strong key={state?.effectAt} className={styles.effectCallout} data-effect={state?.lastEffect} role="status">{effect}</strong>}
        {/* {playing && scoreCue && tick - scoreCue.tick < 40 && <span key={scoreCue.tick} className={styles.scoreCallout} data-milestone={scoreCue.milestone} aria-hidden="true">{scoreCue.milestone ? `${Math.floor(scoreCue.score / 10) * 10} 球突破！` : `+${scoreCue.amount} NICE!`}</span>} */}
        {playing && level > 1 && seconds % 15 < 1.4 && <strong key={level} className={styles.levelUp} aria-hidden="true"><small>まだまだ来るぞ！</small>LEVEL {level}</strong>}
        {!playing && <div className={styles.overlay}><strong>{ended ? "そこまで！" : state ? "ひと息、入れよう。" : "避けろ、芝田！"}</strong><span>{ended ? `${score.toLocaleString("ja-JP")} 球を回避！` : state ? "時間は止まっています" : "画面のどこでも、上下にスワイプ"}</span>{!ended && <ArrowDownUp size={28} aria-hidden="true" />}</div>}
        {playing && tick < 120 && <div className={styles.swipeHint}><ArrowDownUp size={18} aria-hidden="true" />上下にスワイプ！</div>}
      </div>
      <div className={styles.controls}>
        <div className={styles.legend}><span>⚾ HP −1</span><span>◆ 石 −2</span><span>♥ HP ＋1</span><span>? 運試し</span></div>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {api.error && <div className={shared.error} role="alert"><p>{api.error}</p><button type="button" disabled={api.busy} onClick={() => { void retry(); }}>通信を再試行</button></div>}
        {playing ? <button type="button" className={styles.pauseButton} onClick={pause}><Pause size={17} aria-hidden="true" />一時停止</button> : state && !ended ? <button type="button" className={`${shared.primary} ${styles.primary}`} disabled={api.busy || api.retryPending || Boolean(api.error)} onClick={resume}><Play size={20} aria-hidden="true" />{api.busy ? "記録を保存中…" : "続きから、避けろ！"}</button> : <button type="button" className={`${shared.primary} ${styles.primary}`} disabled={api.busy || api.retryPending || Boolean(ended && !saved)} onClick={() => { void start(); }}>{ended ? <RotateCcw size={19} aria-hidden="true" /> : <Play size={19} aria-hidden="true" />}{api.busy || (ended && !saved) ? "記録を保存中…" : ended ? "もう一度、避けろ！" : "死球サバイバル、開始！"}</button>}
        {ended && <section className={styles.result} data-record={record} aria-label="最終結果" aria-live="polite"><p>SHIBATA SURVIVAL RECORD</p><h2>ナイス回避、芝田！</h2><strong>{score.toLocaleString("ja-JP")}<small>球</small></strong><span className={styles.rankBadge}>{title}</span><div className={styles.best}>{!saved ? "記録を保存しています…" : record ? "自己ベスト更新！！" : `自己ベスト ${best.toLocaleString("ja-JP")} 球`}</div><dl><div><dt>生存時間</dt><dd>{time(tick)}<small>秒</small></dd></div><div><dt>到達レベル</dt><dd>{level}</dd></div></dl>{saved && above && <p>{above.rank} 位の記録を超えるまで、あと <b>{(above.score - Math.max(best, score) + 1).toLocaleString("ja-JP")} 球</b>！</p>}</section>}
        <p className={styles.note}>指を置いた場所から上下へスワイプ。マウスのドラッグ / ↑ ↓ / W S でも操作できます。</p>
      </div>
    </section>
    {!playing && <><details className={shared.rules}><summary>サバイバルの心得<ChevronDown size={17} aria-hidden="true" /></summary><div className={shared.rulesBody}><p>体力はハート 5 個。右から飛んでくるボールを避けた数で勝負！ 時間がたつほど難易度アップ。体力がなくなるまで挑戦できます。</p><p>芝田の光る輪を守ろう。ボールに当たると HP −1、石は −2。♥ を取ると HP ＋1。? は運試し！「1 秒間動けない」「5 秒間無敵」「体力全回復」「{DODGE.stonesTicks * DODGE.stepMs / 1000} 秒間ボールが石になる」のどれかが発生します。</p><p>画面・タブを離れると一時停止します。「続きから」で再開。進行は定期的に保存され、再読み込みでは最後に保存されたところから再開します。</p></div></details><GameLeaderboard entries={api.snapshot.leaderboard} personalBest={api.snapshot.personalBest} memberId={api.snapshot.member.id} scoreUnit="球" /></>}
  </GameShell>;
}
