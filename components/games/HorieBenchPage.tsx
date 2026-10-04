"use client";

/* eslint-disable @next/next/no-img-element -- The game uses the team's supplied local artwork. */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ChevronDown, Crosshair, RotateCcw, Zap } from "lucide-react";
import { createEntityId } from "@/lib/entity-id";
import {
  MAX_SWING_MS,
  PITCH_DURATION_MS,
  type BenchReady,
  type BenchRunResult,
} from "@/lib/games/horie-bench";
import { GameLeaderboard } from "./GameLeaderboard";
import { GameAccessState, GameShell } from "./GameShell";
import { useGameApi, type GameAction } from "./useGameApi";
import shared from "./Games.module.css";
import styles from "./HorieBench.module.css";

const GAME_ID = "horie-bench-breaker";
type Sequence = { key: string; runId: string; turn: number; ready: BenchReady };
type ActiveSequence = Sequence & { startedAt: number; submitted: boolean };

export function HorieBenchPage() {
  const api = useGameApi<BenchRunResult>(GAME_ID);
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [swung, setSwung] = useState(false);
  const [impact, setImpact] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const swingButton = useRef<HTMLButtonElement>(null);
  const active = useRef<ActiveSequence | null>(null);
  const finishRef = useRef<(elapsedOverride?: number) => void>(() => {});
  const run = api.snapshot?.run;
  const ready =
    run?.status === "playing" && run.lastResult?.kind === "bench-ready"
      ? run.lastResult
      : null;
  const result =
    run?.lastResult?.kind === "bench-result" ? run.lastResult : null;
  const showResult = Boolean(result && !sequence && !impact);
  const currentPitch = sequence?.ready.pitches[0];
  const canSwing = Boolean(sequence && !swung);

  function finish(elapsedOverride?: number) {
    const playing = active.current;
    if (!playing || playing.submitted || !playing.startedAt) return;
    const elapsed = performance.now() - playing.startedAt;
    if (
      elapsedOverride === undefined &&
      (elapsed < 0 || elapsed >= PITCH_DURATION_MS)
    )
      return;
    playing.submitted = true;
    setSwung(true);
    const elapsedMs = Math.round(
      Math.min(MAX_SWING_MS, Math.max(0, elapsedOverride ?? elapsed)),
    );
    void api.act({
      action: "bench-swing",
      gameId: GAME_ID,
      requestId: createEntityId(),
      runId: playing.runId,
      turn: playing.turn,
      pitchIndex: 0,
      elapsedMs,
    });
  }

  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (!sequence) return;
    let frame = 0;
    let disposed = false;
    const playing: ActiveSequence = {
      ...sequence,
      startedAt: 0,
      submitted: false,
    };
    active.current = playing;
    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      if (!playing.startedAt) playing.startedAt = now;
      const elapsed = now - playing.startedAt;
      if (elapsed >= PITCH_DURATION_MS) {
        if (!playing.submitted) finishRef.current(MAX_SWING_MS);
        active.current = null;
        setSequence(null);
        setImpact(true);
        return;
      }
      const target = playing.ready.pitches[0].targetMs;
      stage.current?.style.setProperty(
        "--travel",
        `${Math.min(100, (elapsed / PITCH_DURATION_MS) * 100)}%`,
      );
      stage.current?.style.setProperty(
        "--target",
        `${(target / PITCH_DURATION_MS) * 100}%`,
      );
      stage.current?.style.setProperty(
        "--ball-x",
        `${80 - Math.min(1.14, elapsed / target) * 57}%`,
      );
      stage.current?.style.setProperty(
        "--ball-y",
        `${55 + Math.min(1, elapsed / target) * 14}%`,
      );
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (!document.hidden) return;
      if (!playing.startedAt) playing.startedAt = performance.now();
      finishRef.current(MAX_SWING_MS);
    };
    frame = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      active.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sequence]);

  useEffect(() => {
    if (canSwing) swingButton.current?.focus({ preventScroll: true });
  }, [canSwing]);
  useEffect(() => {
    if (!impact || (!result && (api.busy || api.retryPending))) return;
    const timer = window.setTimeout(() => setImpact(false), result ? 2400 : 0);
    return () => window.clearTimeout(timer);
  }, [impact, result, api.busy, api.retryPending]);

  async function request(action?: GameAction) {
    const next = await api.act(action);
    if (
      next?.run?.status === "playing" &&
      next.run.lastResult?.kind === "bench-ready"
    ) {
      setSwung(false);
      setSequence({
        key: createEntityId(),
        runId: next.run.id,
        turn: next.run.turn,
        ready: next.run.lastResult,
      });
    }
  }

  function start() {
    if (api.busy || api.retryPending || sequence || impact) return;
    void request({
      gameId: GAME_ID,
      action: "start",
      requestId: createEntityId(),
      runId: run?.id ?? null,
      turn: run?.turn ?? 0,
    });
  }

  function resume() {
    if (
      !ready ||
      !run ||
      api.busy ||
      api.retryPending ||
      sequence ||
      active.current
    )
      return;
    setSwung(false);
    setSequence({
      key: createEntityId(),
      runId: run.id,
      turn: run.turn,
      ready,
    });
  }

  function onPointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    finish();
  }
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (!event.repeat) finish();
  }

  if (api.loading || api.unauthorized || !api.snapshot)
    return (
      <GameShell isGame>
        <GameAccessState
          loading={api.loading}
          unauthorized={api.unauthorized}
          error={api.error}
          onRetry={() => {
            void api.read();
          }}
        />
      </GameShell>
    );

  const crowdDown =
    result && (impact || showResult)
      ? Math.ceil((result.victims / 10000) * 120)
      : 0;
  const phase =
    impact && result
      ? "impact"
      : sequence
        ? "pitch"
        : showResult
          ? "result"
          : "ready";

  let callout = "インコースを、逃すな。";

  if (impact && result) {
    callout =
      result.victims > 0 ? "ベンチまで、一直線ッ!!" : "ベンチは無事だった…";
  } else if (sequence) {
    callout = swung
      ? "勝負の一振り！"
      : `体から ${currentPitch?.distanceCm ?? "?"} cm`;
  } else if (showResult && result) {
    callout = result.grade;
  }

  return (
    <GameShell isGame memberName={api.snapshot.member.name}>
      <div className={`${shared.gameHeading} ${styles.heading}`}>
        <p>HORIE’S PULL HITTING CHALLENGE</p>
        <h1>
          堀江の引っ張れ！<span>三塁ベンチ破壊！</span>
        </h1>
        <small>コースは運。タイミングは腕。勝負は、たった一振り。</small>
      </div>
      <section
        className={`${shared.machine} ${styles.machine}`}
        aria-label="堀江のバッティングゲーム"
      >
        <div className={styles.scoreboard}>
          <div>
            <span>{showResult ? "総被害者数" : "THIRD BASE BENCH"}</span>
            <strong>
              {showResult && result
                ? result.victims.toLocaleString("ja-JP")
                : "10,000"}
              <small>{showResult ? "人" : "人が待機中"}</small>
            </strong>
          </div>
          <div>
            <span>MAX DAMAGE</span>
            <strong>
              100<small>億円</small>
            </strong>
          </div>
        </div>
        <div
          ref={stage}
          className={styles.stage}
          data-phase={phase}
          data-impact={Boolean(impact && result && result.victims > 0)}
          data-hit={Boolean(sequence && swung)}
        >
          <div className={styles.field}>
            <div className={styles.bench} aria-hidden="true">
              <span>三塁ベンチ · 満員御礼</span>

              <div className={styles.crowd}>
                {Array.from({ length: 120 }, (_, i) => (
                  <i
                    key={i}
                    data-down={i < crowdDown}
                    style={
                      {
                        "--delay": `${
                          (i % 15) * 35 + Math.floor(i / 15) * 90
                        }ms`,
                        "--tilt": `${i % 2 ? 75 : -75}deg`,
                      } as CSSProperties
                    }
                  >
                    <span className={styles.crowdHead}>
                      <span className={styles.crowdEyes} />
                      <span className={styles.crowdMouth} />
                    </span>

                    <span className={styles.crowdBody} />
                  </i>
                ))}
              </div>
            </div>{" "}
            <div className={styles.fieldLine} aria-hidden="true" />
            <div className={styles.pitcher} aria-hidden="true">
              <i />
              <span>YG</span>
              <b />
            </div>
            <div className={styles.batter}>
              <img src="/game/horie.PNG" alt="バッターの堀江" />
              <i className={styles.bat} aria-hidden="true" />
              <span>HORIE</span>
            </div>
            {sequence && <i className={styles.ball} aria-hidden="true" />}
            {impact && result && result.victims > 0 && (
              <>
                <i className={styles.pullBall} aria-hidden="true" />
                <b className={styles.burst} aria-hidden="true">
                  ドガシャーン!!<span>★ ★ ★</span>
                </b>
              </>
            )}
            <span className={styles.pitchCount}>1 球勝負</span>
            <strong className={styles.callout}>{callout}</strong>
          </div>
          <div className={styles.timingPanel}>
            <div>
              <Crosshair size={16} aria-hidden="true" />
              <span>
                {sequence
                  ? `インコース · 体から ${currentPitch?.distanceCm} cm · この球で勝負！`
                  : "ボールが金の線に重なる瞬間に、引っ張る！"}
              </span>
            </div>
            <div className={styles.gauge} aria-hidden="true">
              <span className={styles.target} />
              <i className={styles.needle} />
            </div>
            <small>
              投球開始<span>JUST HIT</span>
            </small>
          </div>
        </div>
        <div className={shared.controls}>
          <div className={styles.status} role="status">
            {sequence
              ? canSwing
                ? "金の線に合わせて、一度だけタップ！"
                : "勝負の一振り！ 結果を待とう。"
              : impact || api.busy
                ? "三塁ベンチの状況を確認中…"
                : ready
                  ? "準備済みの 1 球で、勝負を再開しよう。"
                  : !showResult
                    ? "ランダムなインコース、1 球勝負！"
                    : "もう一度、最高の引っ張りを。"}
          </div>
          {api.error && (
            <div className={shared.error} role="alert">
              <p>{api.error}</p>
              {api.retryPending && (
                <button
                  type="button"
                  disabled={api.busy}
                  onClick={() => {
                    void request();
                  }}
                >
                  同じ操作を再試行
                </button>
              )}
              {impact && !api.retryPending && !api.busy && (
                <button
                  type="button"
                  onClick={() => {
                    setImpact(false);
                    void api.read();
                  }}
                >
                  記録を再読み込み
                </button>
              )}
            </div>
          )}
          {sequence ? (
            <button
              key="swing"
              ref={swingButton}
              type="button"
              disabled={!canSwing}
              className={`${shared.primary} ${styles.swingButton}`}
              onPointerDown={onPointer}
              onKeyDown={onKey}
              onClick={(e) => {
                if (e.detail === 0) finish();
              }}
            >
              <Zap size={21} aria-hidden="true" />
              {canSwing ? "引っ張れ！" : "スイング済み"}
            </button>
          ) : (
            <button
              key="start"
              type="button"
              className={`${shared.primary} ${styles.swingButton}`}
              disabled={api.busy || api.retryPending || impact}
              onClick={ready ? resume : start}
            >
              {showResult ? (
                <RotateCcw size={20} aria-hidden="true" />
              ) : (
                <Zap size={20} aria-hidden="true" />
              )}
              {impact || api.busy
                ? "結果を確認中…"
                : ready
                  ? "投球を再開"
                  : showResult
                    ? "もう一度、引っ張る！"
                    : "1 球勝負、スタート！"}
            </button>
          )}
          {showResult && result && (
            <section
              className={styles.result}
              aria-label="最終リザルト"
              aria-live="polite"
            >
              <p>FINAL RESULT</p>
              <h2>{result.grade}</h2>
              <div className={styles.damage}>
                <span>総被害額</span>
                <strong>
                  {result.damage.toLocaleString("ja-JP")}
                  <small>円</small>
                </strong>
              </div>
              <dl>
                <div className={styles.victims}>
                  <dt>総被害者数</dt>
                  <dd>
                    {result.victims.toLocaleString("ja-JP")}
                    <small>人</small>
                  </dd>
                </div>
                <div>
                  <dt>病院送り</dt>
                  <dd>
                    {result.hospitalized.toLocaleString("ja-JP")}
                    <small>名</small>
                  </dd>
                </div>
                <div>
                  <dt>軽傷</dt>
                  <dd>
                    {result.minorInjuries.toLocaleString("ja-JP")}
                    <small>名</small>
                  </dd>
                </div>
              </dl>
              <small>
                体から {result.distanceCm} cm ·{" "}
                {result.elapsedMs === MAX_SWING_MS
                  ? "見逃し"
                  : `タイミング差 ${Math.abs(result.errorMs).toLocaleString("ja-JP")} ms`}
              </small>
              <p className={styles.saved}>総被害額でチームランキングに挑戦！</p>
            </section>
          )}
          <p className={shared.gameNote}>
            タップ / Space / Enter でスイング。
            <br />
            人も被害額も、コミカルなゲーム内の演出です。
          </p>
        </div>
      </section>
      <details className={shared.rules}>
        <summary>
          遊び方を見る
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div className={shared.rulesBody}>
          <p>
            ランダムなインコースの 1 球勝負！
            スタートを押すと投球が始まります。体に近いコースほど、大きな記録を狙えます。
          </p>
          <p>
            動くボールが金の線に重なる瞬間に「引っ張れ！」。一振りのタイミングが、三塁ベンチの運命を決めます。
          </p>
          <p>
            タイミングがずれると威力ダウン。見逃しや投球中のタブ・アプリ切り替えは空振り扱いです。総被害者数は最大
            10,000 人、総被害額は最大 100 億円。総被害額の自己ベストで競います。
          </p>
        </div>
      </details>
      {!sequence && !impact && (
        <GameLeaderboard
          entries={api.snapshot.leaderboard}
          personalBest={api.snapshot.personalBest}
          memberId={api.snapshot.member.id}
        />
      )}
    </GameShell>
  );
}
