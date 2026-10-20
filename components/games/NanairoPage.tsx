"use client";

/* eslint-disable @next/next/no-img-element -- Team-supplied local player photographs. */
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronDown, Crosshair, RotateCcw, Sparkles, Trophy, Zap } from "lucide-react";
import { createEntityId } from "@/lib/entity-id";
import {
  NANAIRO, NANAIRO_PITCHES,
  nanairoBatter, nanairoPitch, nanairoTrajectory, nanairoCourse, isNanairoLuckyBatter, nanairoOutcomeLabel,
  type NanairoState, type NanairoPoint, type NanairoPitchResult,
} from "@/lib/games/nanairo";
import { GameAccessState, GameShell } from "./GameShell";
import { GameLeaderboard } from "./GameLeaderboard";
import { useGameApi, type GameAction } from "./useGameApi";
import shared from "./Games.module.css";
import styles from "./Nanairo.module.css";

type Phase = "aim" | "timing" | "waiting" | "flight";
type Windup = { runId: string; turn: number; target: NanairoPoint; releaseMs: number };
const number = (value: number) => value.toLocaleString("ja-JP");
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${number(Math.abs(value))}`;
const COURSES = Array.from({ length: 9 }, (_, index) => ({ x: (index % 3 + 0.5) * 100 / 3, y: (Math.floor(index / 3) + 0.5) * 100 / 3 }));
const DEFAULT_COURSE = COURSES[7];
const COURSE_LABELS = { strong: "打者の得意コース", weak: "打者の苦手コース", neutral: "通常コース" };
const COURSE_SHORT_LABELS = { strong: "得意", weak: "苦手", neutral: "通常" };
const BATTER_DESCRIPTIONS = (["kitazawa", "chiaki", "ikehara", "yamaki", "kawanabe", "misawa", "kan", "kobayashi", "ishihata", "abe"] as const).map(nanairoBatter);
// Compress the space above the zone without shrinking its nine touch targets.
const fieldY = (value: number) => value < 0 ? value / 3 : value;
function courseName(point: NanairoPoint) {
  return `${point.y < 33 ? "高め" : point.y > 67 ? "低め" : "中央の高さ"}・${point.x < 100 / 3 ? "インコース" : point.x >= 200 / 3 ? "アウトコース" : "中央"}`;
}
function trajectoryPath(result: NanairoPitchResult) {
  let path = "";
  let gap = true;
  for (let step = 0; step <= 100; step++) {
    const t = step / 100;
    if (result.pitchId === "vanish" && t > 0.4 && t < 0.65) { gap = true; continue; }
    const point = nanairoTrajectory(result.pitchId, result.landing, result.direction, t);
    path += `${gap ? "M" : "L"}${point.x.toFixed(2)},${fieldY(point.y).toFixed(2)} `;
    gap = false;
  }
  return path;
}

export function NanairoPage() {
  const api = useGameApi<NanairoState>(NANAIRO.gameId);
  const [phase, setPhase] = useState<Phase>("aim");
  const [preparedFor, setPreparedFor] = useState("");
  const [target, setTarget] = useState<NanairoPoint>(DEFAULT_COURSE);
  const [windup, setWindup] = useState<Windup | null>(null);
  const [animation, setAnimation] = useState<NanairoPitchResult | null>(null);
  const [outOfParkDismissedFor, setOutOfParkDismissedFor] = useState("");
  const activePitch = useRef<(Windup & { startedAt: number }) | null>(null);
  const finishRef = useRef<(elapsedMs?: number) => void>(() => {});
  const gauge = useRef<HTMLDivElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const releaseButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const outOfParkDialog = useRef<HTMLDialogElement>(null);
  const courseButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const gradientId = `nanairo-${useId().replace(/:/g, "")}`;
  const run = api.snapshot?.run;
  const state = run?.lastResult?.kind === "nanairo" ? run.lastResult : null;
  const latest = state?.history.at(-1) ?? null;
  const roundKey = run ? `${run.id}:${run.turn}` : "";
  const active = phase !== "aim";
  // On reload, show the saved result before offering the next prepared pitch.
  const showResult = Boolean(latest && !active && preparedFor !== roundKey);
  const displayResult = phase === "flight" ? animation : showResult ? latest : null;
  const ready = state?.ready ?? null;
  const displayReady = displayResult ?? ready;
  const batter = displayReady ? nanairoBatter(displayReady.batterId) : null;
  const pitch = displayReady ? nanairoPitch(displayReady.pitchId) : null;
  const showOutOfParkEffect = showResult && latest?.outcome === "homer" && latest.outOfPark === true && outOfParkDismissedFor !== roundKey;
  const locked = active || api.busy || api.retryPending || showResult || !ready || showOutOfParkEffect;

  useEffect(() => {
    if (!showOutOfParkEffect) return;
    const dialog = outOfParkDialog.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [showOutOfParkEffect, roundKey]);

  async function request(action?: GameAction) {
    const previousTurn = run?.turn ?? 0;
    const next = await api.act(action);
    setWindup(null);
    if (!next?.run || next.run.lastResult?.kind !== "nanairo") { setPhase("aim"); return; }
    const nextState = next.run.lastResult;
    if (next.run.turn === 0) {
      setPreparedFor(`${next.run.id}:0`);
      setTarget(DEFAULT_COURSE);
      setAnimation(null);
      setPhase("aim");
      return;
    }
    const result = nextState.history.at(-1);
    if (result && next.run.id === run?.id && next.run.turn === previousTurn + 1) {
      setAnimation(result);
      setPhase("flight");
    } else {
      setPreparedFor("");
      setPhase("aim");
    }
  }

  function finish(elapsedOverride?: number) {
    const current = activePitch.current;
    if (!current) return;
    activePitch.current = null;
    const elapsedMs = Math.min(NANAIRO.maxReleaseMs, elapsedOverride ?? Math.max(0, performance.now() - current.startedAt));
    gauge.current?.style.setProperty("--needle", `${Math.min(100, elapsedMs / current.releaseMs * 70)}%`);
    setWindup(null);
    setPhase("waiting");
    void request({ action: "nanairo-pitch", gameId: NANAIRO.gameId, requestId: createEntityId(),
      runId: current.runId, turn: current.turn, target: current.target, elapsedMs });
  }
  useEffect(() => { finishRef.current = finish; });

  useEffect(() => {
    if (!windup) return;
    activePitch.current = { ...windup, startedAt: performance.now() };
    releaseButton.current?.focus({ preventScroll: true });
    let frame = 0;
    const tick = () => {
      const current = activePitch.current;
      if (!current) return;
      const elapsed = performance.now() - current.startedAt;
      gauge.current?.style.setProperty("--needle", `${Math.min(100, elapsed / windup.releaseMs * 70)}%`);
      if (elapsed >= NANAIRO.maxReleaseMs || document.hidden) { finishRef.current(NANAIRO.maxReleaseMs); return; }
      frame = requestAnimationFrame(tick);
    };
    const hidden = () => { if (document.hidden) finishRef.current(NANAIRO.maxReleaseMs); };
    frame = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", hidden);
    return () => { cancelAnimationFrame(frame); activePitch.current = null; document.removeEventListener("visibilitychange", hidden); };
  }, [windup]);

  useEffect(() => {
    if (phase !== "flight" || !animation) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 100 : nanairoPitch(animation.pitchId).durationMs;
    const startedAt = performance.now();
    let frame = 0;
    const tick = () => {
      const progress = document.hidden ? 1 : Math.min(1, (performance.now() - startedAt) / duration);
      const point = nanairoTrajectory(animation.pitchId, animation.landing, animation.direction, reduced ? 1 : progress);
      ball.current?.setAttribute("cx", String(point.x));
      ball.current?.setAttribute("cy", String(fieldY(point.y)));
      ball.current?.setAttribute("r", String(2 + progress * 2.5));
      ball.current?.setAttribute("opacity", animation.pitchId === "vanish" && progress > 0.4 && progress < 0.65 ? "0" : "1");
      trail.current?.setAttribute("stroke-dashoffset", String(1_000 * (1 - progress)));
      if (progress >= 1) { setPreparedFor(""); setPhase("aim"); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, animation]);

  useEffect(() => {
    if (showResult && !api.busy) nextButton.current?.focus({ preventScroll: true });
  }, [showResult, api.busy]);

  function start() {
    if (active || api.busy || api.retryPending) return;
    void request({ action: "start", gameId: NANAIRO.gameId, requestId: createEntityId(), runId: run?.id ?? null, turn: run?.turn ?? 0 });
  }
  function nextBatter() {
    if (!ready || api.busy || api.retryPending || active) return;
    setPreparedFor(roundKey);
    setTarget(DEFAULT_COURSE);
    setAnimation(null);
  }
  function beginWindup() {
    if (locked || !ready || !run) return;
    setPhase("timing");
    setWindup({ runId: run.id, turn: run.turn, target: { ...target }, releaseMs: ready.releaseMs });
  }
  function aimKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (locked || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const column = Math.max(0, Math.min(2, index % 3 + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0)));
    const row = Math.max(0, Math.min(2, Math.floor(index / 3) + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0)));
    const next = row * 3 + column;
    setTarget(COURSES[next]);
    courseButtons.current[next]?.focus({ preventScroll: true });
  }

  if (api.loading || api.unauthorized || !api.snapshot) return <GameShell isGame><GameAccessState loading={api.loading} unauthorized={api.unauthorized} error={api.error} onRetry={() => { void api.read(); }} /></GameShell>;

  const finished = run?.status === "finished";
  const result = showResult ? latest : null;
  const drawnTarget = displayResult?.target ?? target;
  const selectedCourse = Math.min(2, Math.floor(drawnTarget.y * 3 / 100)) * 3 + Math.min(2, Math.floor(drawnTarget.x * 3 / 100));
  const revealedBatterIndex = displayResult ? (state?.history.length ?? 1) - 1 : state?.history.length ?? 0;
  const courseAffinity = batter ? nanairoCourse(batter.id, drawnTarget).affinity : "neutral";
  const finalScore = Math.max(0, state?.total ?? 0);
  const visibleScore = phase === "flight" && animation ? Math.max(0, animation.total - animation.points) : finalScore;
  const callout = phase === "timing" ? "金の線で、リリース！" : phase === "waiting" ? "後藤、投げています…"
    : phase === "flight" ? displayResult?.wild ? "あ！ごめ～ん！" : "いけっ、シンカー！"
    : result ? nanairoOutcomeLabel(result) : ready ? "コースを決めろ！" : "七色の一球で、勝負しよう。";

  return <GameShell isGame memberName={api.snapshot.member.name}>
    {showOutOfParkEffect && <dialog key={roundKey} ref={outOfParkDialog} className={styles.rareDialog} aria-labelledby={`${gradientId}-out-of-park-title`} onCancel={() => setOutOfParkDismissedFor(roundKey)}>
      <div className={styles.rareStars} aria-hidden="true"><Sparkles size={32} /><span>★</span><Sparkles size={24} /></div>
      <span className={styles.rareBadge}>OUT OF THE PARK · BATTER {state?.history.length}</span>
      <h2 id={`${gradientId}-out-of-park-title`}>まさかの一撃！<br /><strong>場外ホームラン！</strong></h2>
      <img src={`/nanairo/${batter?.id}.png`} alt={`場外ホームランを放った${batter?.name}`} />
      <p>打球はスタンドを越え、場外へ。<br /><strong>{batter?.name}</strong>に運ばれた…！</p>
      <button type="button" className={styles.primary} onClick={() => setOutOfParkDismissedFor(roundKey)}><Sparkles size={19} aria-hidden="true" />結果を確認する</button>
    </dialog>}
    <div className={`${shared.gameHeading} ${styles.heading}`}><p>GOTO’S SEVEN-COLOR SINKER</p><h1>後藤の投げろ！<span>七色のシンカー！</span></h1><small>狙いを定めろ。運を信じろ。フルカウント、5人勝負。</small></div>
    <section className={styles.machine} aria-label="七色のシンカー投球ゲーム">
      <div className={styles.scoreboard}>
        <div><span>{finished && showResult ? "FINAL SCORE" : "TOTAL POINTS"}</span><strong>{number(visibleScore)}<small>pt</small></strong></div>
        <div className={styles.count}><span>FULL COUNT</span><strong>3<span>–</span>2</strong><small>ファウルなし</small></div>
        <div className={styles.round}><span>BATTER</span><strong>{displayResult ? state?.history.length : ready ? (state?.history.length ?? 0) + 1 : 0}<small>/ 5</small></strong></div>
      </div>

      {!state ? <div className={styles.intro}>
        <img src="/nanairo/goto.jpeg" alt="七色のシンカーで勝負する後藤" />
        <div><span className={styles.eyebrow}>PITCHER · GOTO</span><h2>最後の一球は、<br />何色だ。</h2><p>7種のシンカーで、真っ向勝負。<br />YGの5打者から三振を奪え。</p><div className={styles.introSteps}><span>01 コースをタップ</span><span>02 ゲージでリリース</span><span>03 あとは勝負！</span></div></div>
      </div> : <>
        <div className={styles.lineup} aria-label="対戦する5打者">{state.lineup.map((id, index) => <span key={id} data-current={index === revealedBatterIndex} data-lucky={index <= revealedBatterIndex && isNanairoLuckyBatter(id)}>
          <small>{index + 1}</small>{index <= revealedBatterIndex ? nanairoBatter(id).name : "？？？"}<b>{state.history[index] ? state.history[index].outcome.endsWith("-k") ? "K" : "·" : ""}</b>
        </span>)}</div>
        {pitch && displayReady && <div className={styles.pitchBanner} data-ultimate={pitch.id === "ultimate"}>
          <div><span>今回の球種</span><strong>{pitch.name}</strong><small>{pitch.description}{!["straight", "drop", "curve", "zigzag", "ultimate"].includes(pitch.id) && ` · ${displayReady.direction === -1 ? "左" : "右"}へ変化`} · 得点×{pitch.multiplier.toFixed(1)}</small></div>
          <div className={styles.risk}><span>基本失投率</span><strong>{pitch.misthrow}%</strong></div>
          {pitch.id === "ultimate" && <p><Sparkles size={15} aria-hidden="true" />「だから俺はシンカーを七種類にした。」</p>}
        </div>}
        <div className={styles.duel}>
          {batter && <aside className={styles.batter} data-lucky={isNanairoLuckyBatter(batter.id)}>
            <img key={batter.id} src={`/nanairo/${batter.id}.png`} alt={`対戦打者・${batter.name}`} decoding="async" />
            <div className={styles.batterCopy}><span>CHALLENGER{isNanairoLuckyBatter(batter.id) ? " · LUCKY!" : ""}</span><h2>{batter.name}</h2><div className={styles.abilities}><span>POWER <b>{batter.power}</b></span><span>MEET <b>{batter.meet}</b></span></div><p>{batter.description}</p></div>
          </aside>}
          <div className={styles.field} data-phase={phase} data-ultimate={pitch?.id === "ultimate"}>
            <span className={styles.parkName}>YG BASEBALL PARK</span><div className={styles.mound} aria-hidden="true" />
            <div className={styles.goto}><img src="/nanairo/goto.jpeg" alt="投手・後藤" /><span>GOTO</span></div>
            <div className={styles.zone} role="group" aria-label="投球コース：9分割から選択" aria-describedby={`${gradientId}-course-guide`}>
              {COURSES.map((point, index) => {
                const affinity = batter ? nanairoCourse(batter.id, point).affinity : "neutral";
                return <button key={index} ref={element => { courseButtons.current[index] = element; }} type="button" className={styles.zoneCell}
                  disabled={locked} aria-pressed={selectedCourse === index} tabIndex={selectedCourse === index ? 0 : -1}
                  data-affinity={affinity} aria-label={`${courseName(point)}・${COURSE_LABELS[affinity]}`}
                  onClick={() => { if (!locked) setTarget(point); }} onKeyDown={event => aimKey(event, index)}>
                  <span className={styles.cellNumber} aria-hidden="true">{index + 1}</span>
                </button>;
              })}
              <span className={styles.zoneLabel}>STRIKE ZONE</span><i className={styles.target} style={{ left: `${drawnTarget.x}%`, top: `${drawnTarget.y}%` }}><Crosshair size={26} aria-hidden="true" /></i>
            </div>
            {displayResult && <svg className={styles.trajectory} viewBox="-30 -40 160 170" aria-hidden="true">
              <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ff7986" /><stop offset="18%" stopColor="#ffbc69" /><stop offset="35%" stopColor="#ffe888" /><stop offset="50%" stopColor="#7cedb1" /><stop offset="68%" stopColor="#76caff" /><stop offset="85%" stopColor="#b697ff" /><stop offset="100%" stopColor="#ff8fcd" /></linearGradient></defs>
              <path ref={trail} d={trajectoryPath(displayResult)} fill="none" stroke={pitch?.id === "ultimate" ? `url(#${gradientId})` : pitch?.color} strokeWidth={pitch?.id === "ultimate" ? 2 : 1} strokeLinecap="round" pathLength="1000" strokeDasharray="1000" strokeDashoffset={phase === "flight" ? 1000 : 0} opacity="0.85" />
              <circle ref={ball} cx={phase === "flight" ? 50 : displayResult.landing.x} cy={phase === "flight" ? -30 : fieldY(displayResult.landing.y)} r="4.5" fill={pitch?.id === "ultimate" ? `url(#${gradientId})` : "#fffbed"} stroke={displayResult.misthrow ? "#ff8e85" : "#d6b87c"} strokeWidth="0.8" />
            </svg>}
            <div className={styles.fieldCallout} role="status" aria-live="polite">{callout}</div>
            <span className={styles.course}>{displayResult ? `${displayResult.swung ? "打者はスイング" : "打者は見送り"}${displayResult.misthrow ? " · 失投" : ""}` : `狙い：${courseName(target)} · ${COURSE_SHORT_LABELS[courseAffinity]}`}</span>
          </div>
        </div>
        <div id={`${gradientId}-course-guide`} className={styles.courseLegend}>
          <span><i data-affinity="strong" />赤：得意（打たれやすい）</span><span><i data-affinity="weak" />青：苦手（狙い目）</span>
        </div>
        {!showResult && <div className={styles.timingPanel}>
          <div><Crosshair size={16} aria-hidden="true" /><span>{phase === "timing" ? "動く球が金の線に重なる瞬間に押す！" : "コースを選んだら、投球モーション開始"}</span></div>
          <div ref={gauge} className={styles.gauge} style={{ "--perfect-width": `${NANAIRO.perfectMs * 2 / (ready?.releaseMs ?? 1900) * 70}%`, "--good-width": `${NANAIRO.goodMs * 2 / (ready?.releaseMs ?? 1900) * 70}%` } as CSSProperties} aria-hidden="true"><i className={styles.goodZone} /><i className={styles.perfectZone} /><span className={styles.releaseLine} /><b className={styles.needle} /></div>
          <div className={styles.gaugeLabels}><span>早い</span><strong>PERFECT ±{NANAIRO.perfectMs}ms</strong><span>遅い</span></div>
          {pitch && <p>失投率：PERFECT {pitch.misthrow}% / GOOD {pitch.misthrow + NANAIRO.goodPenalty}% / MISS {Math.min(100, pitch.misthrow + NANAIRO.missPenalty)}%</p>}
        </div>}
      </>}

      <div className={styles.controls}>
        {result && <div className={styles.result} data-strikeout={result.outcome.endsWith("-k")}>
          <div className={styles.resultTitle}><span>{result.judgement}<small>ズレ {Math.abs(result.errorMs).toFixed(1)}ms · 失投率 {result.misthrowRate}%</small></span><strong>{signed(result.points)}<small>pt</small></strong></div>
          {result.wild && <p className={styles.quote}>後藤「あ！ごめ～ん！」</p>}
          {result.limitBreak && <p className={styles.limitBreak}>予測不能！{nanairoBatter(result.batterId).name}の{result.limitBreak === "both" ? "ミート・パワー" : result.limitBreak === "meet" ? "ミート" : "パワー"}が10に限界突破！</p>}
          <div className={styles.bonuses}><span>基本点 {signed(result.basePoints)}</span>{(result.perfectBonus ?? 0) > 0 && <span>PERFECT三振ボーナス {signed(result.perfectBonus ?? 0)}</span>}{result.comboBonus > 0 && <span>{result.streak}人連続三振 {signed(result.comboBonus)}</span>}{result.luckyBonus > 0 && <span>{nanairoBatter(result.batterId).name}ボーナス {signed(result.luckyBonus)}</span>}{result.courseBonus > 0 && <span>得意コース攻略 {signed(result.courseBonus)}</span>}<span>球種倍率 ×{(result.multiplier ?? 1).toFixed(1)}</span></div>
          {finished && <div className={styles.finish}><Trophy size={25} aria-hidden="true" /><h2>5人勝負、そこまで！</h2><strong>{number(finalScore)}<small>pt</small></strong><p>{state && state.total < 0 ? "合計がマイナスのため、最終スコアは0点。" : "今回の記録を自己ベスト・ランキングに反映しました。"}</p></div>}
        </div>}
        {api.error && <div className={shared.error} role="alert"><p>{api.error}</p>{api.retryPending ? <button type="button" disabled={api.busy} onClick={() => { void request(); }}>同じ投球を再試行</button> : <button type="button" disabled={api.busy} onClick={() => { void api.read(); }}>最新の状態を読み込む</button>}</div>}
        {phase === "timing" ? <button ref={releaseButton} type="button" className={`${styles.primary} ${styles.releaseButton}`}
          onPointerDown={event => { if (event.button === 0 && event.isPrimary) { event.preventDefault(); finish(); } }}
          onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (!event.repeat) finish(); } }}
          onClick={event => { if (event.detail === 0) finish(); }}><Zap size={21} aria-hidden="true" />今だ、投げろ！</button>
          : <button ref={nextButton} type="button" className={styles.primary} disabled={active || api.busy || api.retryPending || showOutOfParkEffect}
            onKeyDown={event => { if (event.repeat && (event.key === " " || event.key === "Enter")) event.preventDefault(); }}
            onClick={!state || finished ? start : showResult ? nextBatter : beginWindup}>
            {!state || finished ? <RotateCcw size={19} aria-hidden="true" /> : <Zap size={20} aria-hidden="true" />}
            {api.busy || phase === "waiting" ? "投球を判定中…" : phase === "flight" ? "打者との勝負…" : !state ? "5人勝負、始める！" : finished ? "もう一度、5人勝負！" : showResult ? "次の打者へ" : "投球モーション開始"}
          </button>}
        <p className={styles.note}>{showResult ? `${state?.streak ?? 0}人連続三振 · 合算 ${number(state?.total ?? 0)}pt` : "9マスからコースを選択。金の線でリリース。キーボードは矢印 / Space / Enter。"}<br />フルカウント開始・ファウルなし。PERFECTでも三振確定ではありません。</p>
      </div>
    </section>

    {showResult && state && <section className={styles.history} aria-label="今回の対戦結果"><h2>今回の勝負</h2>{state.history.map((entry, index) => <div key={entry.batterId}><span>{index + 1}. {nanairoBatter(entry.batterId).name}<small>{nanairoPitch(entry.pitchId).name}</small></span><b>{nanairoOutcomeLabel(entry)}</b><strong>{signed(entry.points)}</strong></div>)}</section>}
    <details className={shared.rules}><summary>球種・打者・遊び方を見る<ChevronDown size={17} aria-hidden="true" /></summary><div className={shared.rulesBody}>
      <p>投球モーション開始後、ゲージの球が金の線に重なった瞬間にリリース！ ±{NANAIRO.perfectMs}ms以内はPERFECT、{NANAIRO.perfectMs}ms超〜{NANAIRO.goodMs}ms以内はGOOD（失投率＋{NANAIRO.goodPenalty}ポイント）、それ以外はMISS（＋{NANAIRO.missPenalty}ポイント）。</p>
      <p>空振り三振＋1,000、見逃し三振＋800。PERFECTで三振を取ると追加＋{number(NANAIRO.perfectStrikeoutBonus)}点。2人連続の2人目＋500、3人目以降は毎回＋1,000。ヒット−500、二塁打−1,000、三塁打−1,500、四球−500、本塁打−2,000、凡打＋500。得意のコースへ投げて三振を取れば＋400。三振以外で連続記録はリセット。5人分を合算し、最終スコアが負なら0点です。</p>
      <p>失投は自動的な四球ではありません。外れた球にも打者が手を出すことがあります。低め・端の厳しいコースは空振りを取りやすく、真ん中は打たれやすくなります。打者の相性と能力も判定に反映します。</p>
      <div className={styles.ruleTable}><table><caption>球種の倍率・出現率・基本失投率</caption><thead><tr><th>球種</th><th>倍率(%)</th><th>出現</th><th>失投</th></tr></thead><tbody>{NANAIRO_PITCHES.map(entry => <tr key={entry.id}><td>{entry.name}<small>{entry.description}</small></td><td>{entry.multiplier.toFixed(1)}</td><td>{entry.weight}%</td><td>{entry.misthrow}%</td></tr>)}</tbody></table></div>
      <p>倍率は、その打席の基本点とボーナスを合算したポイントにだけ適用し、減点にもかかります。</p>
      <dl>{BATTER_DESCRIPTIONS.map(entry => <div key={entry.id}><dt>{entry.name} P{entry.power} / M{entry.meet}</dt><dd>{entry.description}</dd></div>)}</dl>
      <p>北澤から三振を取ると追加＋{number(NANAIRO.kitazawaBonus)}点。石畑を抑えると＋1000点。阿部を抑えると＋1500点。</p>
    </div></details>
    {!active && <GameLeaderboard entries={api.snapshot.leaderboard} personalBest={api.snapshot.personalBest} memberId={api.snapshot.member.id} scoreUnit="pt" />}
  </GameShell>;
}
