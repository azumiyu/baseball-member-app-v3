"use client";

/* eslint-disable @next/next/no-img-element -- The runner is a local animated sprite with a supplied photo fallback. */
import { useEffect, useState, type CSSProperties } from "react";
import { ArrowUpRight, ChevronDown, Droplets, Flag, RefreshCw, Swords, Waves, Zap } from "lucide-react";
import {
  MARATHON,
  marathonAvailableWaterMl,
  marathonDistanceKm,
  marathonJapanDate,
  marathonMood,
  marathonNoWaterWindow,
  marathonWaitMs,
  type MarathonSnapshot,
} from "@/lib/games/marathon";
import { GameLeaderboard } from "./GameLeaderboard";
import { GameAccessState, GameShell } from "./GameShell";
import { useMarathonApi } from "./useMarathonApi";
import shared from "./Games.module.css";
import styles from "./Marathon.module.css";

function liters(amountMl: number) {
  return (amountMl / 1000).toLocaleString("ja-JP", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function elapsedLabel(elapsedMs: number) {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 時間前`;
  return `${Math.floor(seconds / 86400)} 日前`;
}

function japanTimeLabel(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

/** Paint the clock only while visible; running never requires background requests. */
function useRunnerClock(enabled: boolean, now: () => number) {
  const [clock, setClock] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let interval = 0;
    const update = () => setClock(now());
    const onVisibility = () => {
      window.clearInterval(interval);
      setPaused(document.hidden);
      if (!document.hidden) {
        update();
        interval = window.setInterval(update, 1000);
      }
    };
    // The timer follows the browser's external visibility state.
    const firstFrame = requestAnimationFrame(onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(firstFrame);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, now]);
  return { clock, paused };
}

export function MarathonPage() {
  const api = useMarathonApi();
  const { clock, paused } = useRunnerClock(Boolean(api.snapshot), api.now);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [receipt, setReceipt] = useState<MarathonSnapshot["lastWater"]>(null);
  const snapshot = api.snapshot;

  async function giveWater() {
    const next = await api.water();
    if (next?.lastWater) setReceipt(next.lastWater);
  }

  async function stealWater() {
    await api.steal();
  }

  if (api.loading || api.unauthorized || !snapshot) {
    return (
      <GameShell isGame>
        <GameAccessState
          loading={api.loading}
          unauthorized={api.unauthorized}
          error={api.error}
          onRetry={() => { void api.read(); }}
        />
      </GameShell>
    );
  }

  const currentNow = Math.max(snapshot.serverNow, clock);
  const mood = marathonMood(snapshot.state, currentNow);
  const availableMl = marathonAvailableWaterMl(snapshot.state, currentNow);
  const waitMs = marathonWaitMs(snapshot.state, currentNow);
  const noWaterWindow = marathonNoWaterWindow(currentNow);
  const distanceKm = marathonDistanceKm(snapshot.state, currentNow);
  const thirstMs = Math.max(0, currentNow - snapshot.state.lastWateredAt);
  const thirstPercent = Math.min(100, thirstMs / MARATHON.initialThirstMs * 100);
  const exclusiveForOther = snapshot.state.exclusiveUntil > currentNow && snapshot.state.exclusivePlayerId !== snapshot.member.id;
  const dailyWaterCount = marathonJapanDate(snapshot.serverNow) === marathonJapanDate(currentNow) ? snapshot.dailyWaterCount : 0;
  const dailyLimitReached = dailyWaterCount >= MARATHON.dailyWaterLimit;
  const dailyStealCount = marathonJapanDate(snapshot.serverNow) === marathonJapanDate(currentNow) ? snapshot.dailyStealCount : 0;
  const dailyStealLimitReached = dailyStealCount >= MARATHON.dailyStealLimit;
  const hasEnoughToSteal = (snapshot.personalBest?.score ?? 0) >= MARATHON.stealMinimumScoreMl;
  const noStealTarget = snapshot.stealTargetCount <= 0;
  const stealDisabled = api.busy || api.refreshing || api.retryPending || api.stealRetryPending
    || dailyStealLimitReached || !hasEnoughToSteal || noStealTarget;
  const lastSteal = snapshot.lastSteal;
  const stealResultAgeMs = lastSteal ? currentNow - lastSteal.stolenAt : -1;
  const showStealResult = stealResultAgeMs >= 0 && stealResultAgeMs < MARATHON.gachaResultDisplayMs;
  const displayReceipt = receipt ?? snapshot.lastWater;
  const gachaReceipt = displayReceipt && typeof displayReceipt.gachaLabel === "string" ? displayReceipt : null;
  const gachaResultAgeMs = gachaReceipt ? currentNow - gachaReceipt.wateredAt : -1;
  const showGachaResult = !noWaterWindow.isResting && gachaResultAgeMs >= 0 && gachaResultAgeMs < MARATHON.gachaResultDisplayMs;
  const thirstLabel = noWaterWindow.isResting ? "今は水いらないよ！" : waitMs > 0 ? "おなかいっぱい" : thirstPercent < 25 ? "まだ、ひとくちで大丈夫" : thirstPercent < 75 ? "だんだん、のどが渇いてきた" : "のどがカラカラ！";
  const moodRemaining = mood.endsAt ? Math.max(0, Math.ceil((mood.endsAt - currentNow) / 1000)) : 0;
  const buttonDisabled = api.busy || api.refreshing || api.retryPending || api.stealRetryPending || waitMs > 0 || noWaterWindow.isResting || exclusiveForOther || dailyLimitReached;

  return (
    <GameShell isGame memberName={snapshot.member.name}>
      <div className={`${shared.gameHeading} ${styles.heading}`}>
        <p><span /> KOBAYASHI’S NEVER-ENDING RUN</p>
        <h1>小林の走れ！<span>マラソン！</span></h1>
        <small>小林は、今日も走る。みんなは、給水で応援。</small>
      </div>

      <section className={styles.machine} aria-label="小林のマラソン給水所">
        <div className={styles.distancePanel}>
          <div className={styles.distanceTitle}><Flag size={15} aria-hidden="true" /><span>小林の累計走行距離</span><b>ずっと RUNNING</b></div>
          <div className={styles.distance}><strong>{distanceKm.toLocaleString("ja-JP", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</strong><span>km</span></div>
          <div className={styles.pace}><span />1 分 300 m のマイペース。お休みなし！</div>
        </div>

        <div className={styles.scene} data-mood={mood.kind} data-paused={paused} data-resting={noWaterWindow.isResting}>
          <div className={styles.sun} aria-hidden="true" />
          <div className={styles.clouds} aria-hidden="true"><i /><i /><i /></div>
          <div className={styles.farHills} aria-hidden="true" />
          <div className={styles.nearHills} aria-hidden="true" />
          <div className={styles.speech} data-gacha-result={showGachaResult}>
            <span>{noWaterWindow.isResting || exclusiveForOther ? "KOBAYASHI SAYS" : showGachaResult ? "GACHA RESULT" : mood.kind === "normal" ? "KOBAYASHI SAYS" : "SPECIAL CONDITION"}</span>
            <strong>{noWaterWindow.isResting ? "今は水いらないよ！" : exclusiveForOther ? `今日は${snapshot.state.exclusivePlayerName ?? "メンバー"}だけが給水できるよ！` : showGachaResult ? gachaReceipt?.gachaLabel : mood.kind === "normal" ? (waitMs > 0 ? "ぷは〜！ おなかいっぱい！" : thirstLabel) : mood.label}</strong>
            {noWaterWindow.isResting ? <small>給水は {japanTimeLabel(noWaterWindow.endsAt)} から</small> : exclusiveForOther ? <small>日付が変わると、またみんなが給水できるよ</small> : showGachaResult ? <small>{liters(gachaReceipt?.amountMl ?? 0)} L{gachaReceipt?.stolenFromName ? `（${gachaReceipt.stolenFromName}から移転）` : ""}</small> : mood.kind !== "normal" && <small>{mood.kind === "parched" ? "給水できる量 × 2" : "給水できる量 × 0.5"} <span>あと {moodRemaining} 秒</span></small>}
          </div>
          <div className={styles.track} aria-hidden="true"><i /><i /><i /></div>
          <div className={styles.runner}>
            <div className={styles.runnerShadow} aria-hidden="true" />
            <img className={styles.spritePreload} src="/game/kobayashi-runner.png" alt="" aria-hidden="true" onLoad={() => setSpriteLoaded(true)} onError={() => setSpriteLoaded(false)} />
            {spriteLoaded ? <div className={styles.runnerSprite} role="img" aria-label="走り続ける小林" /> : <img className={styles.runnerPhoto} src="/homepage/introduce/4.JPEG" alt="走り続ける小林" />}
            <span className={styles.runnerTag}>KOBAYASHI <ArrowUpRight size={12} aria-hidden="true" /></span>
          </div>
          <div className={styles.station} aria-hidden="true"><span>給水所</span><Droplets size={29} /><i /><b>WATER</b></div>
          <div className={styles.sceneFooter}><span><i /> EVERYONE’S RUNNER</span><span>FINISH LINE ? <b>∞</b></span></div>
        </div>

        <div className={styles.controls}>
          <div className={styles.waterHeading}><div><span>いま給水できる量の目安</span><strong>{liters(availableMl)}<small>L</small></strong></div><span className={styles.multiplier} data-special={mood.kind !== "normal"}><Waves size={15} aria-hidden="true" />{mood.multiplier === 1 ? "いつものペース" : `給水量 × ${mood.multiplier}`}</span></div>
          <div className={styles.thirstCopy}><span><Droplets size={13} aria-hidden="true" />のどの渇き</span><strong>{thirstLabel}</strong></div>
          <div className={styles.thirstMeter} role="meter" aria-label="のどの渇き" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(thirstPercent)} aria-valuetext={thirstLabel}><span style={{ "--thirst": `${thirstPercent}%` } as CSSProperties} /></div>
          <div className={styles.dailyQuota}><span>今日のあなたの給水</span><strong>{dailyWaterCount} / {MARATHON.dailyWaterLimit} 回</strong></div>

          <button type="button" className={styles.waterButton} disabled={buttonDisabled} onClick={() => { void giveWater(); }}>
            <span className={styles.bottle} aria-hidden="true"><i /><Droplets size={23} /></span>
            <span><strong>{api.busy ? "小林にお届け中…" : noWaterWindow.isResting ? "今は水いらないよ！" : exclusiveForOther ? `今日は${snapshot.state.exclusivePlayerName ?? "メンバー"}だけ！` : dailyLimitReached ? "今日は10回給水しました" : waitMs > 0 ? "おなかいっぱい！" : "小林に水をあげる！"}</strong><small>{api.busy ? "給水を確認しています" : noWaterWindow.isResting ? `${japanTimeLabel(noWaterWindow.endsAt)}から給水できます` : exclusiveForOther ? "日付が変わると、みんなが給水できます" : dailyLimitReached ? "日付が変わるとまた給水できます" : waitMs > 0 ? `あと ${Math.ceil(waitMs / 1000)} 秒で、また給水できます` : `目安 ${liters(availableMl)} L で、走りを応援`}</small></span>
            <ArrowUpRight size={24} aria-hidden="true" />
          </button>

          <div className={styles.stealQuota}><span>今日のあなたの強奪</span><strong>{dailyStealCount} / {MARATHON.dailyStealLimit} 回</strong></div>
          <button type="button" className={styles.stealButton} disabled={stealDisabled} onClick={() => { void stealWater(); }}>
            <Swords size={21} aria-hidden="true" />
            <span><strong>{api.busy ? "強奪を確認中…" : dailyStealLimitReached ? "今日は2回使いました" : !hasEnoughToSteal ? "累計10mLから使えます" : noStealTarget ? "強奪できる相手がいません" : "上位メンバーから強奪"}</strong><small>自分の累計を10%消費して、上位の給水量を5〜20%移します</small></span>
          </button>

          {snapshot.pendingStealNotification && <div className={styles.stealNotice} role="alert">
            <div><strong>給水量を強奪されました</strong><p>未確認の強奪 {snapshot.pendingStealNotification.count} 回、合計 {liters(snapshot.pendingStealNotification.stolenMl)} L。直近の相手：{snapshot.pendingStealNotification.lastGiverName}</p></div>
            <button type="button" disabled={api.busy || api.refreshing} onClick={() => { void api.acknowledgeStealNotification(snapshot.pendingStealNotification!.version); }}>確認しました</button>
          </div>}

          {showStealResult && lastSteal && <div className={styles.stealResult} role="status" aria-live="polite">
            <Swords size={15} aria-hidden="true" /><span><strong>{lastSteal.targetName}</strong>から {liters(lastSteal.stolenMl)} L強奪！<small>あなたの累計から {liters(lastSteal.consumedMl)} L消費（{lastSteal.percent}%）</small></span>
          </div>}

          <div className={styles.receipt} role="status" aria-live="polite">
            {receipt ? <><Droplets size={16} aria-hidden="true" /><span><strong>{liters(receipt.amountMl)} L</strong> のお水をありがとう！<small>{receipt.gachaLabel}{receipt.stolenFromName ? `（${receipt.stolenFromName}から）` : ""}</small>{receipt.multiplier !== 1 && <small>今回の給水量 × {receipt.multiplier}</small>}</span></> : <><Zap size={15} aria-hidden="true" /><span>給水のたびにガチャ発生！ 1人1日10回まで。</span></>}
          </div>

          {api.error && <div className={shared.error} role="alert"><p>{api.error}</p>{api.retryPending && <button type="button" disabled={api.busy || api.refreshing} onClick={() => { void giveWater(); }}>同じ給水を再試行</button>}{api.stealRetryPending && <button type="button" disabled={api.busy || api.refreshing} onClick={() => { void stealWater(); }}>同じ強奪を再試行</button>}</div>}

          <div className={styles.lastWater}>
            <span>さいごの給水</span>
            <strong>{snapshot.state.lastGiverName || "まだ誰も給水していません"}</strong>
            {snapshot.state.lastGiverName && <small>{elapsedLabel(currentNow - snapshot.state.lastWateredAt)}</small>}
          </div>
          <div className={styles.totals}>
            <div><span>あなたの累計給水</span><strong>{liters(snapshot.personalBest?.score ?? 0)}<small>L</small></strong></div>
            <div><span>みんなの累計給水</span><strong>{liters(snapshot.state.totalWaterMl)}<small>L</small></strong></div>
          </div>
          <div className={styles.refreshRow}><p>誰かの給水で量が変わります。給水時・更新時に反映。</p><button type="button" disabled={api.busy || api.refreshing || api.retryPending} onClick={() => { void api.read(); }}><RefreshCw size={13} aria-hidden="true" className={api.refreshing ? styles.spinning : ""} />{api.refreshing ? "更新中" : "いまの様子を更新"}</button></div>
        </div>
      </section>

      <details className={shared.rules}>
        <summary>給水所のあそび方<ChevronDown size={17} aria-hidden="true" /></summary>
        <div className={shared.rulesBody}>
          <p>小林は、みんなで見守る 1 人のランナー。ページを閉じている間も、1 分 300 m でずっと走り続けます。</p>
          <p>水をあげると、あなたの累計給水量に加算。たくさんお水をあげた人がランキング上位に！ 誰かが給水すると、みんなの小林のおなかがいっぱいになります。次の給水は 10 秒後から。給水の間隔が長いほど、たくさん飲んでくれます。1人1日10回までです。</p>
          <p>毎日 02:00〜06:48（日本時間）は「今は水いらないよ！」の休憩時間です。水をあげるたびに抽選があり、3倍（10%）、0.5倍（10%）、2倍（20%）、1位から累計給水量の10%を移す（5%）、今日1人だけ給水できる（1%）、通常（54%）のいずれかになります。結果は小林の吹き出しにも表示されます。</p>
          <p>強奪ボタンでは1日2回まで、自分の累計給水量の10%を消費して、ランキング上位のメンバーから給水量を移せます。移す割合は5%（50%）、10%（30%）、15%（15%）、20%（5%）の抽選です。1位の場合は対象がランダムに選ばれます。強奪された人には次回ゲームを開いたときに通知します。</p>
          <p>たまに「ちょうのどかわいた！！」で給水量が 2 倍。「ランナーズハイ中！！」は半分に。同時に誰かが給水したときは最新の様子に変わるので、ひと息おいて応援しましょう。</p>
        </div>
      </details>
      <GameLeaderboard entries={snapshot.leaderboard} personalBest={snapshot.personalBest} memberId={snapshot.member.id} scoreUnit="L" scoreScale={1000} precision={3} cumulative />
    </GameShell>
  );
}
