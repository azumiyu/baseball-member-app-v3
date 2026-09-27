"use client";

/* eslint-disable @next/next/no-img-element -- The pitcher uses the team's supplied local artwork. */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, Crosshair, RotateCcw, Zap } from "lucide-react";
import { createEntityId } from "@/lib/entity-id";
import type { FastballRunResult } from "@/lib/games/api-types";
import { MAX_ELAPSED_MS, MAX_SPEED } from "@/lib/games/fastball";
import { GameLeaderboard } from "./GameLeaderboard";
import { GameAccessState, GameShell } from "./GameShell";
import { useGameApi, type GameAction } from "./useGameApi";
import shared from "./Games.module.css";
import styles from "./Fastball.module.css";

const GAME_ID = "oshino-fastball";
type Windup = { runId: string; releaseMs: number; key: string };
type ActivePitch = Windup & { startedAt: number };

/** Presentation only. Input is measured independently of the animation's frames. */
function paintWindup(element: HTMLDivElement | null, elapsedMs: number, releaseMs: number) {
  if (!element) return;
  const progress = Math.min(1, Math.max(0, elapsedMs / releaseMs));
  const lift = Math.min(1, progress * 2);
  const release = Math.max(0, progress * 2 - 1);
  element.style.setProperty("--needle", `${Math.min(100, elapsedMs / releaseMs * 78)}%`);
  element.style.setProperty("--body-angle", `${-7 * lift + 25 * release}deg`);
  element.style.setProperty("--arm-angle", `${-60 - 80 * lift + 170 * release}deg`);
  element.style.setProperty("--elbow-angle", `${-80 + 105 * release}deg`);
  element.style.setProperty("--knee-angle", `${-55 * lift + 80 * release}deg`);
}

function Pitcher() {
  return (
    <div className={styles.pitcher} aria-hidden="true">
      <div className={styles.rearLeg} />
      <div className={styles.frontLeg}><i /></div>
      <div className={styles.body}>
        <div className={styles.jersey}>YG<span>OSHINO</span></div>
        <div className={styles.gloveArm}><i /></div>
        <div className={styles.throwArm}><div className={styles.forearm}><i className={styles.heldBall} /></div></div>
        <div className={styles.head}><img src="/game/oshino.PNG" alt="" /></div>
      </div>
    </div>
  );
}

export function FastballPage() {
  const api = useGameApi<FastballRunResult>(GAME_ID);
  const [windup, setWindup] = useState<Windup | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pitchButton = useRef<HTMLButtonElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const activePitch = useRef<ActivePitch | null>(null);
  const finishRef = useRef<(elapsedMs?: number) => void>(() => {});
  const run = api.snapshot?.run;
  const ready = run?.status === "playing" && run.lastResult && "kind" in run.lastResult ? run.lastResult : null;
  const result = run?.lastResult && !("kind" in run.lastResult) ? run.lastResult : null;
  const showResult = Boolean(result && !windup && !inFlight);

  async function request(action?: GameAction) {
    const next = await api.act(action);
    if (next?.run?.status === "playing" && next.run.lastResult && "kind" in next.run.lastResult) {
      setWindup({ runId: next.run.id, releaseMs: next.run.lastResult.releaseMs, key: createEntityId() });
    }
  }

  function finish(elapsedOverride?: number) {
    const pitch = activePitch.current;
    if (!pitch) return;
    // Lock immediately: pointer, keyboard and synthetic clicks cannot submit twice.
    activePitch.current = null;
    const elapsedMs = Math.min(MAX_ELAPSED_MS, elapsedOverride ?? Math.max(0, performance.now() - pitch.startedAt));
    paintWindup(stage.current, elapsedMs, pitch.releaseMs);
    setWindup(null);
    setInFlight(true);
    void request({ gameId: GAME_ID, action: "pitch", requestId: createEntityId(), runId: pitch.runId, turn: 0, elapsedMs });
  }

  useEffect(() => { finishRef.current = finish; });

  useEffect(() => {
    if (!windup) return;
    let frame = 0;
    let alive = true;
    let started = false;
    const tick = () => {
      if (!alive) return;
      const now = performance.now();
      if (!started) {
        started = true;
        activePitch.current = { ...windup, startedAt: now };
        pitchButton.current?.focus({ preventScroll: true });
      }
      if (!activePitch.current) return;
      const elapsedMs = now - activePitch.current.startedAt;
      paintWindup(stage.current, elapsedMs, windup.releaseMs);
      if (elapsedMs >= MAX_ELAPSED_MS || document.hidden) {
        finishRef.current(MAX_ELAPSED_MS);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const onVisibilityChange = () => {
      if (document.hidden) finishRef.current(MAX_ELAPSED_MS);
    };
    frame = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      activePitch.current = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [windup]);

  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setTimeout(() => setInFlight(false), 520);
    return () => window.clearTimeout(timer);
  }, [inFlight]);

  useEffect(() => {
    if (showResult && !api.busy) startButton.current?.focus({ preventScroll: true });
  }, [showResult, api.busy]);

  function start() {
    if (api.busy || api.retryPending || windup || inFlight) return;
    void request({ gameId: GAME_ID, action: "start", requestId: createEntityId(), runId: run?.id ?? null, turn: run?.turn ?? 0 });
  }

  function resume() {
    if (!run || !ready || api.busy || api.retryPending) return;
    setWindup({ runId: run.id, releaseMs: ready.releaseMs, key: createEntityId() });
  }

  function onPitchPointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    finish();
  }

  function onPitchKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (!event.repeat) finish();
  }

  if (api.loading || api.unauthorized || !api.snapshot) return <GameShell isGame><GameAccessState loading={api.loading} unauthorized={api.unauthorized} error={api.error} onRetry={() => { void api.read(); }} /></GameShell>;

  const errorLabel = result ? result.speed === MAX_SPEED ? "ジャストリリース！" : `${result.errorMs < 0 ? "早かった" : "遅かった"}：${Math.abs(result.errorMs).toFixed(3)} ms` : "";

  return (
    <GameShell isGame memberName={api.snapshot.member.name}>
      <div className={`${shared.gameHeading} ${styles.heading}`}><p>OSHINO’S FASTBALL CHALLENGE</p><h1>押野の出せ！<span>剛速球！</span></h1><small>一瞬をつかめ。目指せ、200.00 km/h。</small></div>
      <section className={`${shared.machine} ${styles.machine}`} aria-label="剛速球タイミングゲーム">
        <div className={styles.scoreboard}><div><span>FASTBALL RECORD</span><strong>{showResult && result ? (result.speed / 100).toFixed(2) : "---.--"}<small>km/h</small></strong></div><div className={styles.limit}><span>MAX SPEED</span><strong>200.00</strong></div></div>
        <div ref={stage} className={styles.stage} data-phase={windup ? "windup" : inFlight ? "flight" : showResult ? "result" : "ready"}>
          <div className={styles.stadium}>
            <div className={styles.floodlight} aria-hidden="true" /><div className={styles.floodlight} aria-hidden="true" />
            <span className={styles.stadiumLabel}>YG BASEBALL PARK</span><div className={styles.diamond} aria-hidden="true" /><div className={styles.mound} aria-hidden="true" />
            <Pitcher />
            <img className={styles.oshinoArt} src="/game/oshino.PNG" alt="剛速球を投げる押野" />
            <div className={styles.flyingBall} aria-hidden="true" />
            <span className={styles.fieldCallout}>{windup ? "タイミングを合わせろ！" : inFlight ? "いっけえええ！" : showResult && result ? result.grade : "その一球に、すべてを。"}</span>
          </div>
          <div className={styles.timingPanel}>
            <div className={styles.timingTitle}><Crosshair size={15} aria-hidden="true" /><span>ボールと金の線が重なる瞬間に、投げる！</span></div>
            <div className={styles.gauge} aria-hidden="true"><div className={styles.releaseZone} /><span className={styles.releaseLine} /><i className={styles.needle} /></div>
            <div className={styles.gaugeLabels}><span>振りかぶって…</span><strong>RELEASE</strong></div>
          </div>
        </div>
        <div className={shared.controls}>
          <div className={styles.status} role="status" aria-live="polite">
            {windup ? <p>金の線を狙って、ひと押し。</p> : inFlight || api.busy ? <p>球速を計測しています…</p> : showResult && result ? <><strong>{result.grade}</strong><p>{errorLabel}</p><small>自己ベストをチームランキングに反映しました。</small></> : <p>振りかぶったら、リリースの瞬間を狙おう。</p>}
          </div>
          {api.error && <div className={shared.error} role="alert"><p>{api.error}</p>{api.retryPending && <button type="button" disabled={api.busy} onClick={() => { void request(); }}>同じ操作を再試行</button>}</div>}
          {windup ? <button key="pitch" ref={pitchButton} type="button" className={`${shared.primary} ${styles.pitchButton}`} onPointerDown={onPitchPointer} onKeyDown={onPitchKey} onClick={(event) => { if (event.detail === 0) finish(); }}><Zap size={23} aria-hidden="true" />投げる！</button> : <button key="start" ref={startButton} type="button" className={`${shared.primary} ${styles.startButton}`} disabled={api.busy || api.retryPending || inFlight} onKeyDown={(event) => { if (event.repeat && (event.key === " " || event.key === "Enter")) event.preventDefault(); }} onClick={ready ? resume : start}>{showResult ? <RotateCcw size={20} aria-hidden="true" /> : <Zap size={21} aria-hidden="true" />}{api.busy || inFlight ? "計測中…" : ready ? "投球を再開" : showResult ? "もう一球、投げる！" : "投球スタート"}</button>}
          <p className={shared.gameNote}>スマホはタップ。キーボードは Space / Enter。<br />1 球ごとに勝負！ 球速は小数点以下 2 桁まで記録します。</p>
        </div>
      </section>
      <details className={shared.rules}><summary>遊び方を見る<ChevronDown size={17} aria-hidden="true" /></summary><div className={shared.rulesBody}><p>「投球スタート」で押野が振りかぶります。動くボールが金のリリース線と重なる瞬間に「投げる！」を押してください。</p><p>リリースとの差が小さいほど剛速球に。上限は 200.00 km/h。小さなタイミングの差も球速に反映される、かなりシビアな勝負です。</p><p>押さずに 10 秒経つか、投球中に別のタブ・アプリへ移ると、その投球は記録 0.00 km/h になります。</p></div></details>
      {!windup && !inFlight && <GameLeaderboard entries={api.snapshot.leaderboard} personalBest={api.snapshot.personalBest} memberId={api.snapshot.member.id} scoreUnit="km/h" scoreScale={100} precision={2} />}
    </GameShell>
  );
}
