"use client";

/* eslint-disable @next/next/no-img-element -- The runner is a local animated sprite with a supplied photo fallback. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, Droplets, Flag, RefreshCw, ShieldCheck, ShoppingBag, Sparkles, Swords, Waves, X, Zap } from "lucide-react";
import {
  MARATHON,
  marathonAvailableWaterMl,
  marathonDistanceKm,
  marathonJapanDate,
  marathonMood,
  marathonNoWaterWindow,
  marathonWaitMs,
  type MarathonShopItem,
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

function japanDateTimeLabel(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(timestamp);
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
  const [shopOpen, setShopOpen] = useState(false);
  const [depositLiters, setDepositLiters] = useState("");
  const shopButtonRef = useRef<HTMLButtonElement>(null);
  const shopDialogRef = useRef<HTMLElement>(null);
  const shopCloseRef = useRef<HTMLButtonElement>(null);
  const snapshot = api.snapshot;

  useEffect(() => {
    if (!shopOpen) return;
    const dialog = shopDialogRef.current;
    const shopButton = shopButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shopCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShopOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      shopButton?.focus();
    };
  }, [shopOpen]);

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
  const isSameJapanDay = marathonJapanDate(snapshot.serverNow) === marathonJapanDate(currentNow);
  const dailyWaterCount = isSameJapanDay ? snapshot.dailyWaterCount : 0;
  const dailyLimitReached = dailyWaterCount >= MARATHON.dailyWaterLimit;
  const dailyStealCount = isSameJapanDay ? snapshot.dailyStealCount : 0;
  const dailyStealLimit = MARATHON.dailyStealLimit + snapshot.shop.stealGloveCount;
  const dailyStealLimitReached = dailyStealCount >= dailyStealLimit;
  const guardPurchasesToday = isSameJapanDay ? snapshot.shop.guardPurchasesToday : 0;
  const counterPurchasesToday = isSameJapanDay ? snapshot.shop.counterPurchasesToday : 0;
  const trapPurchasesToday = isSameJapanDay ? snapshot.shop.trapPurchasesToday : 0;
  const reservoirDepositMl = Math.round(Number(depositLiters) * 1000);
  const reservoirCanDeposit = snapshot.shop.reservoirOwned && snapshot.shop.handMl > 0
    && (snapshot.shop.reservoirNextDepositAt === null || currentNow >= snapshot.shop.reservoirNextDepositAt);
  const reservoirDepositValid = Number.isFinite(reservoirDepositMl) && reservoirDepositMl > 0
    && reservoirDepositMl <= snapshot.shop.handMl;
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
  const shopReceiptAgeMs = snapshot.lastShopPurchase ? currentNow - snapshot.lastShopPurchase.purchasedAt : -1;
  const shopReceipt = snapshot.lastShopPurchase && shopReceiptAgeMs >= 0 && shopReceiptAgeMs < MARATHON.gachaResultDisplayMs
    ? snapshot.lastShopPurchase : null;
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

          <div className={styles.stealQuota}><span>今日のあなたの強奪</span><strong>{dailyStealCount} / {dailyStealLimit} 回</strong></div>
          <button type="button" className={styles.stealButton} disabled={stealDisabled} onClick={() => { void stealWater(); }}>
            <Swords size={21} aria-hidden="true" />
            <span><strong>{api.busy ? "強奪を確認中…" : dailyStealLimitReached ? `今日は${dailyStealLimit}回使いました` : !hasEnoughToSteal ? "累計10mLから使えます" : noStealTarget ? "強奪できる相手がいません" : "上位メンバーから強奪"}</strong><small>自分の累計を10%消費して、上位の給水量を5〜20%移します</small></span>
          </button>
          <button
            ref={shopButtonRef}
            type="button"
            className={styles.shopOpenButton}
            aria-haspopup="dialog"
            aria-expanded={shopOpen}
            aria-controls="marathon-shop-dialog"
            onClick={() => { setShopOpen(true); }}
          >
            <ShoppingBag size={19} aria-hidden="true" />
            <span><strong>買い物</strong><small>残高 {liters(snapshot.shop.walletMl)} L</small></span>
            <ArrowUpRight size={19} aria-hidden="true" />
          </button>

          {snapshot.pendingStealNotification && <div className={styles.stealNotice} role="alert">
            <div><strong>給水量を強奪されました</strong><p>未確認の強奪 {snapshot.pendingStealNotification.count} 回、合計 {liters(snapshot.pendingStealNotification.stolenMl)} L。直近の相手：{snapshot.pendingStealNotification.lastGiverName}</p></div>
            <button type="button" disabled={api.busy || api.refreshing} onClick={() => { void api.acknowledgeStealNotification(snapshot.pendingStealNotification!.version); }}>確認しました</button>
          </div>}

          {showStealResult && lastSteal && <div className={styles.stealResult} role="status" aria-live="polite">
            <Swords size={15} aria-hidden="true" /><span>{lastSteal.blocked ? <><strong>{lastSteal.targetName}</strong>の強奪ガードで防がれました</> : lastSteal.countered ? <><strong>{lastSteal.targetName}</strong>にカウンターされ、{liters(lastSteal.counteredMl)} L返されました</> : <><strong>{lastSteal.targetName}</strong>から {liters(lastSteal.stolenMl)} L強奪！</>}<small>あなたの累計から {liters(lastSteal.consumedMl)} L消費（{lastSteal.percent}%）</small></span>
          </div>}

          <div className={styles.receipt} role="status" aria-live="polite">
            {receipt ? <><Droplets size={16} aria-hidden="true" /><span><strong>{liters(receipt.amountMl)} L</strong>{receipt.trapTriggered ? " トラップで給水量が減りました" : " のお水をありがとう！"}<small>{receipt.gachaLabel}{receipt.stolenFromName ? `（${receipt.stolenFromName}から）` : ""}</small>{receipt.multiplier !== 1 && <small>今回の給水量 × {receipt.multiplier}</small>}</span></> : <><Zap size={15} aria-hidden="true" /><span>給水のたびにガチャ発生！ 1人1日10回まで。</span></>}
          </div>

          {api.error && <div className={shared.error} role="alert"><p>{api.error}</p>{api.retryPending && <button type="button" disabled={api.busy || api.refreshing} onClick={() => { void giveWater(); }}>同じ給水を再試行</button>}{api.stealRetryPending && <button type="button" disabled={api.busy || api.refreshing} onClick={() => { void stealWater(); }}>同じ強奪を再試行</button>}{api.shopRetryPending && <button type="button" disabled={api.busy || api.refreshing} onClick={() => { void api.shopBuy("mini-kobayashi"); }}>同じ購入を再試行</button>}</div>}

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

      {shopOpen && <div
        className={styles.shopBackdrop}
        onMouseDown={(event) => { if (event.target === event.currentTarget) setShopOpen(false); }}
      >
        <section
          ref={shopDialogRef}
          id="marathon-shop-dialog"
          className={styles.shopDialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="marathon-shop-title"
          tabIndex={-1}
        >
          <div className={styles.shopModalTop}>
            <div className={styles.shopHeading}>
              <div><span><ShoppingBag size={15} aria-hidden="true" /> WATER SHOP</span><h2 id="marathon-shop-title">給水量でお買い物</h2></div>
              <p>あなたの累計給水量を使います<br /><strong>{liters(snapshot.shop.walletMl)} L</strong> 残高</p>
            </div>
            <button ref={shopCloseRef} type="button" className={styles.shopClose} aria-label="ショップを閉じる" onClick={() => { setShopOpen(false); }}><X size={20} /></button>
          </div>
          <div className={styles.shopInventory}>
            <span>ミニ小林 <b>{snapshot.shop.miniKobayashiCount}体（+{snapshot.shop.miniKobayashiCount * 5}%）</b></span>
            <span>強奪ガード <b>{snapshot.shop.stealGuardCharges}回分</b></span>
            <span>強奪カウンター <b>{snapshot.shop.stealCounterCharges}回分</b></span>
            <span>強奪強化グローブ <b>{snapshot.shop.stealGloveCount}個</b></span>
            <span>設置中の毒トラップ <b>{snapshot.shop.pendingTrapCount}個</b></span>
            <span>貯水池 <b>{snapshot.shop.reservoirOwned ? `${liters(snapshot.shop.reservoirMl)} L` : "未購入"}</b></span>
            <span>貯水池の神 <b>{snapshot.shop.reservoirGodCount}体（+{snapshot.shop.reservoirGodCount * 5}%/日）</b></span>
          </div>
          {snapshot.shop.reservoirOwned && <section className={styles.reservoirPanel} aria-label="貯水池への預け入れ">
            <div><strong>貯水池に預ける</strong><p>手持ちから預けます。預けた水は強奪されません。預け入れは7日に1度です。</p></div>
            {snapshot.shop.reservoirNextDepositAt !== null && currentNow < snapshot.shop.reservoirNextDepositAt
              ? <p className={styles.reservoirCooldown}>次回の預け入れ：{japanDateTimeLabel(snapshot.shop.reservoirNextDepositAt)} 以降</p>
              : <p className={styles.reservoirCooldown}>預け入れ可能 · 手持ち {liters(snapshot.shop.handMl)} L</p>}
            <div className={styles.reservoirForm}>
              <label className={styles.reservoirAmount}><span>預ける量（L）</span><input type="number" min="0.001" step="0.001" max={liters(snapshot.shop.handMl)} value={depositLiters} onChange={(event) => { setDepositLiters(event.target.value); }} placeholder={liters(snapshot.shop.handMl)} /></label>
              <button type="button" disabled={api.busy || api.refreshing || snapshot.shop.handMl <= 0} onClick={() => { setDepositLiters((snapshot.shop.handMl / 1000).toFixed(3)); }}>手持ち全額</button>
              <button type="button" disabled={api.busy || api.refreshing || !reservoirCanDeposit || !reservoirDepositValid || api.reservoirRetryPending} onClick={() => { void api.depositReservoir(reservoirDepositMl).then((next) => { if (next) setDepositLiters(""); }); }}>預け入れる</button>
            </div>
          </section>}
          {shopReceipt && <p className={styles.shopSuccess} role="status" aria-live="polite">購入しました：{shopReceipt.item === "mini-kobayashi" ? "ミニ小林" : shopReceipt.item === "steal-guard" ? "強奪ガード" : shopReceipt.item === "steal-counter" ? "強奪カウンター" : shopReceipt.item === "poison-trap" ? "毒給水トラップ" : shopReceipt.item === "steal-glove" ? "強奪強化グローブ" : shopReceipt.item === "reservoir" ? "貯水池" : "貯水池の神"}（{liters(shopReceipt.costMl)} L消費）</p>}
          {api.error && <div className={shared.error} role="alert"><p>{api.error}</p>{api.shopRetryPending && <button type="button" disabled={api.busy || api.refreshing} onClick={() => { void api.shopBuy("mini-kobayashi"); }}>同じ購入を再試行</button>}{api.reservoirRetryPending && <button type="button" disabled={api.busy || api.refreshing} onClick={() => { void api.depositReservoir(reservoirDepositMl); }}>同じ預け入れを再試行</button>}</div>}
          <div className={styles.shopGrid}>
            {([
              { item: "mini-kobayashi", name: "ミニ小林", icon: <Zap size={18} />, effect: "給水のたび、獲得量が常に+5%。何体でも購入でき、価格は1体ごとに5%上昇。", owned: `${snapshot.shop.miniKobayashiCount}体（+${snapshot.shop.miniKobayashiCount * 5}%）`, disabled: false },
              { item: "steal-guard", name: "強奪ガード", icon: <ShieldCheck size={18} />, effect: "強奪を3回受けずに防ぎます。1日2回まで購入可能。", owned: `残り ${snapshot.shop.stealGuardCharges}回分・本日 ${guardPurchasesToday}/2個`, disabled: guardPurchasesToday >= 2 },
              { item: "steal-counter", name: "強奪カウンター", icon: <Swords size={18} />, effect: "次に受ける強奪を1回カウンターし、相手に給水量を返します。1日1回まで。", owned: `残り ${snapshot.shop.stealCounterCharges}回分・本日 ${counterPurchasesToday}/1個`, disabled: counterPurchasesToday >= 1 },
              { item: "poison-trap", name: "毒給水トラップ", icon: <Droplets size={18} />, effect: "次に給水する他のメンバーの累計給水量を減らします（自分には発動しません）。1日2個まで設置可能。", owned: `設置中 ${snapshot.shop.pendingTrapCount}個・本日 ${trapPurchasesToday}/2個`, disabled: trapPurchasesToday >= 2 },
              { item: "steal-glove", name: "強奪強化グローブ", icon: <Swords size={18} />, effect: "1日の強奪回数が+1。何個でも購入でき、価格は1個ごとに50%上昇。", owned: `${snapshot.shop.stealGloveCount}個所持・本日上限 ${dailyStealLimit}回`, disabled: false },
              { item: "reservoir", name: "貯水池", icon: <Waves size={18} />, effect: "200Lで1度だけ購入。手持ちの水を7日に1度預けられ、池の水は強奪されません。買い物では手持ちから先に使い、不足分を池から使います。", owned: snapshot.shop.reservoirOwned ? "購入済み" : "未購入", disabled: snapshot.shop.reservoirOwned, disabledLabel: "購入済み" },
              { item: "reservoir-god", name: "貯水池の神", icon: <Sparkles size={18} />, effect: "貯水池が必要です。所持数1体ごとに、池の水が毎日5%ずつ増えます。何度でも購入でき、価格は1体ごとに5%上昇。", owned: `${snapshot.shop.reservoirGodCount}体（+${snapshot.shop.reservoirGodCount * 5}%/日）`, disabled: !snapshot.shop.reservoirOwned, disabledLabel: "先に貯水池を購入" },
            ] satisfies { item: MarathonShopItem; name: string; icon: ReactNode; effect: string; owned: string; disabled: boolean; disabledLabel?: string }[]).map((product) => {
              const price = snapshot.shop.pricesMl[product.item];
              const insufficient = snapshot.shop.walletMl < price;
              const cannotBuy = api.busy || api.refreshing || api.shopRetryPending || product.disabled || insufficient;
              return <article key={product.item} className={styles.shopCard}>
                <div className={styles.shopItemTitle}><span>{product.icon}</span><div><h3>{product.name}</h3><small>{product.owned}</small></div></div>
                <p>{product.effect}</p>
                <button type="button" disabled={cannotBuy} onClick={() => { void api.shopBuy(product.item); }}>
                  <span>{product.disabled ? product.disabledLabel ?? "購入できません" : insufficient ? "手持ちと貯水池の残高が足りません" : "購入する"}</span>
                  <strong>{liters(price)} L</strong>
                </button>
              </article>;
            })}
          </div>
        </section>
      </div>}

      <details className={shared.rules}>
        <summary>給水所のあそび方<ChevronDown size={17} aria-hidden="true" /></summary>
        <div className={shared.rulesBody}>
          <p>小林は、みんなで見守る 1 人のランナー。ページを閉じている間も、1 分 300 m でずっと走り続けます。</p>
          <p>ランキングは手持ちの給水量と貯水池の残高の合計で決まります。貯水池の水は強奪されません。誰かが給水すると、みんなの小林のおなかがいっぱいになります。次の給水は 10 秒後から。給水の間隔が長いほど、たくさん飲んでくれます。1人1日10回までです。</p>
          <p>毎日 02:00〜06:48（日本時間）は「今は水いらないよ！」の休憩時間です。水をあげるたびに抽選があり、3倍（10%）、0.5倍（10%）、2倍（20%）、ランキング1位の手持ち給水量の10%を移す（5%）、今日1人だけ給水できる（1%）、通常（54%）のいずれかになります。結果は小林の吹き出しにも表示されます。</p>
          <p>強奪ボタンでは通常1日2回まで、自分の手持ち給水量の10%を消費して、ランキング上位のメンバーから手持ち給水量を移せます。貯水池の水は強奪できません。移す割合は5%（50%）、10%（30%）、15%（15%）、20%（5%）の抽選です。1位の場合は対象がランダムに選ばれます。強奪された人には次回ゲームを開いたときに通知します。強化グローブで1日上限を増やせます。</p>
          <p>ショップでは自分の手持ち給水量と貯水池の水を消費して購入します。ミニ小林は給水量+5%（20Lから、所持数ごとに価格+5%）、強奪ガードは3回防御（60L・1日2個）、カウンターは1回反撃（40L・1日1個）、毒給水トラップは次の給水をマイナスに（25L・1日2個）、強奪強化グローブは1日上限+1回（50Lから、所持数ごとに価格+50%）です。</p>
          <p>たまに「ちょうのどかわいた！！」で給水量が 2 倍。「ランナーズハイ中！！」は半分に。同時に誰かが給水したときは最新の様子に変わるので、ひと息おいて応援しましょう。</p>
        </div>
      </details>
      <GameLeaderboard entries={snapshot.leaderboard} personalBest={snapshot.personalBest} memberId={snapshot.member.id} scoreUnit="L" scoreScale={1000} precision={3} cumulative
        rankingNote="手持ちの給水量と貯水池残高の合計で競います。貯水池の水は強奪されません。"
        personalScoreLabel="あなたのランキング合計" />
    </GameShell>
  );
}
