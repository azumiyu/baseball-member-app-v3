"use client";

/* eslint-disable @next/next/no-img-element -- The game uses the team's local character artwork. */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, Flame, RotateCcw, Soup, Wind } from "lucide-react";
import { createEntityId } from "@/lib/entity-id";
import { RAMEN, resolveRamen, simulateRamen, type RamenInput, type RamenResult, type RamenRunResult } from "@/lib/games/ramen";
import { GameLeaderboard } from "./GameLeaderboard";
import { GameAccessState, GameShell } from "./GameShell";
import { useGameApi } from "./useGameApi";
import shared from "./Games.module.css";
import styles from "./Ramen.module.css";

const GAME_ID = "negishi-ramen";
type Play = { runId: string; turn: number; startedAt: number; startedWall: number; inputs: RamenInput[]; previousBest: number | null; requestId: string; submitted: boolean; storageKey: string };
const initial = () => simulateRamen([], 0);
const grams = (value: number) => Math.floor(value).toLocaleString("ja-JP");

function remember(play: Play) {
  try {
    localStorage.setItem(play.storageKey, JSON.stringify({ startedWall: play.startedWall, inputs: play.inputs, previousBest: play.previousBest, requestId: play.requestId }));
  } catch { /* A full or disabled browser store must not interrupt play. */ }
}

export function RamenPage() {
  const api = useGameApi<RamenRunResult>(GAME_ID);
  const [frame, setFrame] = useState(initial);
  const [sessionKey, setSessionKey] = useState("");
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState<RamenResult | null>(null);
  const [bestBefore, setBestBefore] = useState<number | null>(null);
  const [inputLimit, setInputLimit] = useState(false);
  const [breathNotice, setBreathNotice] = useState<{ at: number; text: string } | null>(null);
  const active = useRef<Play | null>(null);
  const owner = useRef<number | string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<() => void>(() => {});
  const releaseRef = useRef<() => void>(() => {});
  const run = api.snapshot?.run;
  const ready = run?.status === "playing" && run.lastResult?.kind === "ramen-ready";
  const serverResult = run?.lastResult?.kind === "ramen-result" ? run.lastResult : null;
  const result = serverResult ?? preview;
  const memberId = api.snapshot?.member.id;
  const runId = ready ? run?.id : undefined;
  const turn = run?.turn ?? 0;

  async function save(play: Play) {
    const next = await api.act({ action: "ramen-finish", gameId: GAME_ID, requestId: play.requestId, runId: play.runId, turn: play.turn, inputs: play.inputs });
    if (next && next.run?.id !== play.runId) {
      try { localStorage.removeItem(play.storageKey); } catch { /* Storage is optional. */ }
      resetForNextBowl();
      return;
    }
    if (next?.run?.status === "finished") {
      try { localStorage.removeItem(play.storageKey); } catch { /* Storage is optional. */ }
    }
  }

  function finish() {
    const play = active.current;
    if (!play || play.submitted) return;
    play.submitted = true;
    owner.current = null;
    setPlaying(false);
    setFrame(simulateRamen(play.inputs));
    setPreview(resolveRamen(play.inputs));
    remember(play);
    void save(play);
  }

  function input(held: boolean) {
    let play = active.current;
    if (!play) {
      if (!held || !ready || !run || !memberId || api.busy || api.retryPending || result) return;
      const startedWall = Date.now();
      play = { runId: run.id, turn: run.turn, startedAt: performance.now(), startedWall, inputs: [{ at: 0, held: true }], previousBest: api.snapshot?.personalBest?.score ?? null, requestId: createEntityId(), submitted: false, storageKey: `${GAME_ID}:${memberId}:${run.id}` };
      active.current = play;
      setBestBefore(play.previousBest);
      setPlaying(true);
      setSessionKey(play.requestId);
      setFrame(simulateRamen(play.inputs, 0));
      remember(play);
      return;
    }
    if (play.submitted) return;
    const elapsed = Math.floor(performance.now() - play.startedAt);
    if (elapsed >= RAMEN.durationMs) { finish(); return; }
    const last = play.inputs.at(-1);
    if (last?.held === held) return;
    if (held && play.inputs.length >= RAMEN.maxInputs - 2) { setInputLimit(true); return; }
    const at = Math.min(RAMEN.durationMs, Math.max(elapsed, (last?.at ?? -1) + 1));
    // 休憩中はすすれない
if (held) {
  const current = simulateRamen(play.inputs, at);

  if (
    current.resting ||
    current.lung < 100 - 1e-8 ||
    current.coughUntil > at
  ) {
    setFrame(current);
    return;
  }
}
    play.inputs.push({ at, held });
    const state = simulateRamen(play.inputs, at);
    setFrame(state);
    if (!held && state.lastJudgement === "normal") setBreathNotice({ at, text: state.lung > RAMEN.perfectMax ? "早い！ 緑の帯まで、もう少し。" : state.lung < RAMEN.perfectMin ? "遅い！ 緑の帯で離そう。" : "次は緑より上まで回復してから！" });
    remember(play);
  }

  function release() { owner.current = null; input(false); }

  function resetForNextBowl() {
    active.current = null;
    owner.current = null;
    setSessionKey("");
    setPlaying(false);
    setPreview(null);
    setBestBefore(null);
    setFrame(initial());
    setInputLimit(false);
    setBreathNotice(null);
    button.current?.focus({ preventScroll: true });
  }

  async function retry() {
    if (active.current?.submitted) {
      await save(active.current);
      return;
    }
    if (!api.retryPending) {
      await api.read();
      return;
    }
    const next = await api.act();
    if (next?.run?.lastResult?.kind === "ramen-ready") resetForNextBowl();
    else if (next?.run?.status === "finished" && active.current) {
      try { localStorage.removeItem(active.current.storageKey); } catch { /* Storage is optional. */ }
    }
  }

  useEffect(() => { finishRef.current = finish; releaseRef.current = release; });

  useEffect(() => {
    if (!runId || !memberId) return;
    const timer = window.setTimeout(() => {
      if (active.current?.runId === runId) return;
      const storageKey = `${GAME_ID}:${memberId}:${runId}`;
      try {
        const cached = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        if (!cached || !Array.isArray(cached.inputs) || !cached.inputs.length || !Number.isFinite(cached.startedWall) || typeof cached.requestId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(cached.requestId)) return;
        simulateRamen(cached.inputs);
        const elapsed = Math.max(0, Date.now() - cached.startedWall);
        const inputs: RamenInput[] = cached.inputs;
        const last = inputs.at(-1)!;
        if (last.held && elapsed < RAMEN.durationMs) inputs.push({ at: Math.min(RAMEN.durationMs, Math.max(Math.floor(elapsed), last.at + 1)), held: false });
        const play: Play = { runId, turn, storageKey, inputs, startedWall: cached.startedWall, startedAt: performance.now() - elapsed, previousBest: typeof cached.previousBest === "number" ? cached.previousBest : null, requestId: cached.requestId, submitted: false };
        active.current = play;
        setBestBefore(play.previousBest);
        setFrame(simulateRamen(inputs, Math.min(RAMEN.durationMs, elapsed)));
        setPlaying(true);
        setSessionKey(play.requestId);
        remember(play);
      } catch { /* Invalid or unavailable local data leaves the prepared run playable. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [runId, memberId, turn]);

  useEffect(() => {
    if (!sessionKey || !active.current) return;
    let raf = 0;
    const play = active.current;
    const tick = () => {
      if (play.submitted) return;
      const elapsed = Math.max(0, performance.now() - play.startedAt);
      if (elapsed >= RAMEN.durationMs) { finishRef.current(); return; }
      setFrame(simulateRamen(play.inputs, Math.floor(elapsed)));
      raf = requestAnimationFrame(tick);
    };
    const onLeave = () => releaseRef.current();
    const onVisibility = () => {
      if (document.hidden) onLeave();
      else if (performance.now() - play.startedAt >= RAMEN.durationMs) finishRef.current();
    };
    raf = requestAnimationFrame(tick);
    let timer = 0;
    const finishOnTime = () => {
      if (play.submitted) return;
      const remaining = RAMEN.durationMs - (performance.now() - play.startedAt);
      if (remaining <= 0) finishRef.current();
      else timer = window.setTimeout(finishOnTime, Math.ceil(remaining));
    };
    finishOnTime();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onLeave);
    window.addEventListener("pagehide", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("pagehide", onLeave);
      if (!play.submitted) {
        const elapsed = Math.floor(performance.now() - play.startedAt);
        const last = play.inputs.at(-1);
        if (last?.held && elapsed < RAMEN.durationMs) play.inputs.push({ at: Math.min(RAMEN.durationMs, Math.max(elapsed, last.at + 1)), held: false });
        remember(play);
      }
    };
  }, [sessionKey]);

  useEffect(() => {
    if (ready && !result) button.current?.focus({ preventScroll: true });
  }, [ready, result]);

  async function prepare() {
    if (api.busy || api.retryPending || playing) return;
    const next = await api.act({ action: "start", gameId: GAME_ID, requestId: createEntityId(), runId: run?.id ?? null, turn: run?.turn ?? 0 });
    if (next?.run?.lastResult?.kind === "ramen-ready") {
      resetForNextBowl();
    }
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || owner.current !== null) return;
    event.preventDefault();
    owner.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    input(true);
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (owner.current !== event.pointerId) return;
    release();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (owner.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) pointerUp(event);
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.repeat || owner.current !== null) return;
    owner.current = event.key;
    input(true);
  }
  function keyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (owner.current === event.key) release();
  }

  if (api.loading || api.unauthorized || !api.snapshot) return <GameShell isGame><GameAccessState loading={api.loading} unauthorized={api.unauthorized} error={api.error} onRetry={() => { void api.read(); }} /></GameShell>;

  const coughing = playing && frame.coughUntil > frame.elapsedMs;
  // 休憩中
const resting = playing && frame.resting;

// PERFECTによる高速回復中
const perfectRest = resting && frame.recoveryBoost;
  const slurping = playing && frame.held && !coughing;
  const zone = playing && frame.zoneUntil > frame.elapsedMs;
  const seconds = result ? 0 : Math.max(0, (RAMEN.durationMs - frame.elapsedMs) / 1000);
  const finalRush = playing && seconds <= 5;
  const justPerfect = playing && frame.lastJudgement === "perfect" && frame.elapsedMs - frame.judgementAt < 800;
  const justBowl = playing && frame.bowls > 0 && frame.elapsedMs - frame.lastBowlAt < 650;
  const justNormal = playing && frame.lastJudgement === "normal" && breathNotice && frame.elapsedMs - breathNotice.at < 1000;
  const face = coughing ? "cough" : frame.lung <= 10 ? "limit" : frame.lung <= 25 ? "red" : frame.lung <= 50 ? "effort" : "easy";
const callout = coughing
  ? "ゲホッ！！！"
  : justPerfect
    ? zone && frame.combo % 3 === 0
      ? "根岸ゾーン突入！！"
      : "PERFECT!!"
    : resting
      ? perfectRest
        ? "高速息継ぎ中！！"
        : "スーハー… 100%まで回復！"
      : justBowl
        ? "替え玉ァ！！"
        : slurping
          ? "ズゾゾゾゾゾ！！"
          : playing
            ? "準備完了！すすれ！！"
            : result
              ? "ごちそうさまでした！"
              : "押して、すすれ。離して、息継ぎ。";  const finalGrams = result?.grams ?? frame.grams;
  const better = result && bestBefore !== null && result.grams > bestBefore;
  const saved = Boolean(serverResult);
  const best = api.snapshot.personalBest?.score ?? 0;
  const above = api.snapshot.leaderboard.filter(entry => entry.playerId !== memberId && entry.score >= Math.max(best, result?.grams ?? 0)).at(-1);

  return <GameShell isGame memberName={api.snapshot.member.name}>
    <div className={`${shared.gameHeading} ${styles.heading}`}><p>YG 熱血拉麺道場 · 20 秒一本勝負</p><h1>根岸の<span>すすれ！ラーメン！</span></h1></div>
    <section className={`${shared.machine} ${styles.machine}`} data-zone={zone} data-rush={finalRush} aria-label="根岸のラーメンゲーム">
      <div className={styles.noren} aria-hidden="true"><span>根</span><span>岸</span><span>軒</span><small>自家製・根性麺</small></div>
      <div className={styles.scoreboard}>
        <div><span>すすった総重量</span><strong>{grams(finalGrams)}<small>g</small></strong></div>
        <div className={styles.timer} data-urgent={finalRush} data-countdown={playing && seconds <= 3}><span>残り時間</span><strong>{seconds.toFixed(1)}<small>秒</small></strong></div>
      </div>
      <div className={styles.stage} data-slurping={slurping} data-face={face} data-zone={zone} style={{ "--noodle-speed": `${0.5 / Math.max(1, frame.multiplier)}s` } as CSSProperties}>
        <div className={styles.aura} aria-hidden="true" />
        <div className={styles.art}>
          <img src="/game/negishi_susuru.PNG" alt={slurping ? "ラーメンを勢いよくすする根岸" : ""} aria-hidden={!slurping} data-visible={slurping} draggable={false} />
          <img src="/game/negishi_stop.PNG" alt={!slurping ? "息継ぎする根岸" : ""} aria-hidden={slurping} data-visible={!slurping} draggable={false} />
          <div className={styles.noodles} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
          {coughing && <div className={styles.spray} aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>}
        </div>
        <div className={styles.combo}><span>COMBO</span><strong>{frame.combo}</strong><small>すすり ×{frame.multiplier.toFixed(2)}</small>{zone && <b><Flame size={13} /> ZONE {(Math.max(0, frame.zoneUntil - frame.elapsedMs) / 1000).toFixed(1)}s</b>}</div>
        <div className={styles.bowls} aria-label={`完食 ${result?.bowls ?? frame.bowls} 杯`}><div aria-hidden="true">{Array.from({ length: Math.min(8, result?.bowls ?? frame.bowls) }, (_, i) => <i key={i} style={{ bottom: i * 6 }} />)}</div><span>{result?.bowls ?? frame.bowls}<small>杯完食</small></span></div>
        {finalRush && <div className={styles.rush}>{seconds <= 3 ? Math.ceil(seconds) : "ラスト5秒！！"}</div>}
        <strong className={styles.callout} data-perfect={justPerfect} data-cough={coughing}>{callout}</strong>
      </div>
      <div className={styles.playPanel}>
        <div className={styles.lungLabel}><span><Wind size={15} aria-hidden="true" />肺活量</span><strong>{frame.lung.toFixed(1)}<small>%</small></strong><span className={styles.perfectKey}>緑で離す！</span></div>
        <div className={styles.lung} role="progressbar" aria-label="肺活量。10 から 25 パーセントで離すと PERFECT" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(frame.lung.toFixed(1))} data-low={frame.lung <= 10}><div className={styles.lungFill} style={{ width: `${frame.lung}%` }} /><span className={styles.perfectBand} /><i style={{ left: `${Math.min(99, frame.lung)}%` }} /></div>
        <p className={styles.hint}>{coughing ? "息切れ！ 1 秒休憩。次は緑で離そう。" : justPerfect ? `PERFECT！ ${frame.combo} コンボ！ 緑より上まで回復しよう。` : justNormal ? breathNotice.text : playing ? "緑で離して、緑より上まで回復！" : result ? "次は、もう一杯いける。" : "長押しでスタート！ 指を離すと肺活量が回復。"}</p>
        {api.error && <div className={shared.error} role="alert"><p>{api.error}</p><button type="button" disabled={api.busy} onClick={() => { void retry(); }}>記録・通信を再試行</button></div>}
        {ready && !result ? <button ref={button} type="button" className={styles.holdButton} data-resting={resting}
data-boost={perfectRest}
aria-disabled={resting} data-held={slurping} disabled={api.busy || api.retryPending || inputLimit} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} onPointerMove={pointerMove} onPointerLeave={pointerUp} onKeyDown={keyDown} onKeyUp={keyUp} onBlur={release} onContextMenu={event => event.preventDefault()} aria-label="長押しですする。離すと息継ぎ。キーボードは Space または Enter を長押し" aria-pressed={slurping}><Soup size={25} aria-hidden="true" /><span>
  {coughing
    ? "ゲホッ… 息を整えろ！"
    : resting
      ? perfectRest
        ? "⚡ PERFECT！高速回復中！"
        : "💨 息継ぎ中..."
      : slurping
        ? "すすれぇぇぇ！！"
        : playing
          ? "準備完了！すすれ！！"
          : "長押しで、すすれ！"
  }

  <small>
    {resting
      ? `肺活量100%まで待とう！（現在${frame.lung.toFixed(0)}%）`
      : "押す → すする　離す → 息継ぎ"
    }
  </small>
</span></button> : <button type="button" className={`${shared.primary} ${styles.retry}`} disabled={api.busy || api.retryPending || Boolean(preview && !saved)} onClick={() => { void prepare(); }}>{result ? <RotateCcw size={20} aria-hidden="true" /> : <Soup size={22} aria-hidden="true" />}{api.busy ? "準備・記録中…" : result ? "もう一杯！ もう一度すする！" : "いらっしゃい！ 開店する"}</button>}
        {inputLimit && <p className={styles.hint} role="status">入力回数の上限です。残り時間は息継ぎになります。</p>}
        {result && <section className={styles.result} aria-label="最終リザルト" aria-live="polite"><p>本日のすすり記録</p><h2>{result.title}</h2><strong className={styles.finalScore}>{grams(result.grams)}<small>g</small></strong><div className={styles.best}>{saved ? better ? "自己ベスト更新！！" : bestBefore === null && preview ? "初めての記録、いただきました！" : `自己ベスト ${grams(best)} g${result.grams < best ? ` ／ あと ${grams(best - result.grams + 1)} g で更新` : ""}` : "記録を保存中…"}</div><dl><div><dt>完食杯数</dt><dd>{result.bowls}<small>杯</small></dd></div><div><dt>最大コンボ</dt><dd>{result.maxCombo}</dd></div><div><dt>PERFECT</dt><dd>{result.perfects}<small>回</small></dd></div></dl>{saved && above && <p className={styles.nextRank}>{above.rank} 位の記録を超えるまで、あと <b>{grams(above.score - Math.max(best, result.grams) + 1)} g</b>！</p>}</section>}
        <p className={styles.inputNote}>スマホは長押し · PC はマウス / Space / Enter<br />1 杯 300g。すすり始めから 20 秒、休憩中も時間は進みます。</p>
      </div>
    </section>
    {!playing && <><details className={shared.rules}><summary>すすりの極意<ChevronDown size={17} aria-hidden="true" /></summary><div className={shared.rulesBody}><p>長押しですする、離して息継ぎ。肺活量が緑の帯（10〜25%）に入ったら離すと PERFECT！ 次の PERFECT は緑より上まで回復してから狙おう。</p><p>PERFECT 連続成功で速度アップ、最大 1.4 倍！ 3 回連続成功ごとに「根岸ゾーン」が 3 秒間発動し、さらに 1.5 倍。通常の息継ぎ・むせるとコンボはリセット。</p><p>肺活量が 0 になると 1 秒むせて、50% まで回復。画面やタブを離れると息継ぎになります。タイマーは止まりません。</p></div></details><GameLeaderboard entries={api.snapshot.leaderboard} personalBest={api.snapshot.personalBest} memberId={api.snapshot.member.id} scoreUnit="g" /></>}
  </GameShell>;
}
