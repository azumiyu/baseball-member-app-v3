"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, CircleDot, Gauge, Info, Keyboard, Pause, Play, RotateCcw, Sparkles, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { PachinkoBoard } from "./PachinkoBoard";
import { usePachinkoAssets } from "./usePachinkoAssets";
import { usePachinkoAudio, type PachinkoCue } from "./usePachinkoAudio";
import { usePachinkoGame } from "./usePachinkoGame";
import { HOLD_CAPACITY, type Phase } from "./pachinko-game";
import styles from "./PachinkoPage.module.css";

const phaseCues: Partial<Record<Phase, PachinkoCue>> = {
  "left-stop": "stop", "right-stop": "stop", reach: "reach",
  "super-intro": "super", pitch: "pitch", swing: "swing",
  miss: "miss", revival: "revival", jackpot: "jackpot",
};
const heatNames = { normal: "白保留", chance: "赤保留・チャンス", hot: "金保留・激アツ" };
const trayBalls = Array.from({ length: 44 }, (_, index) => ({
  left: `${6 + (index * 19.7) % 87}%`,
  bottom: `${8 + Math.floor(index / 15) * 19 + index % 3 * 2}%`,
  "--ball-delay": `${index % 8 * .07}s`,
} as CSSProperties));
const format = (value: number) => value.toLocaleString("ja-JP");

export function PachinkoPage() {
  const reducedMotion = useReducedMotion();
  const assets = usePachinkoAssets();
  const game = usePachinkoGame({ ready: assets.ready, reducedMotion });
  const audio = usePachinkoAudio();
  const { play, shoutSeven, setAmbience, stopAll, unlock } = audio;
  const { launchBall, setFiring, setPower, setPaused, push: resolvePush } = game;
  const lastEntry = useRef(0);
  const lastCue = useRef("");
  const lastBonus = useRef("");
  const lastBall = useRef(0);
  const lastPayout = useRef(0);
  const previousMode = useRef(game.mode);
  const handleDrag = useRef<{ x: number; y: number; power: number } | null>(null);
  const rightPlay = game.mode === "rush" || game.phase === "bonus";
  const ambience = game.paused ? "off" : game.phase === "bonus" ? "bonus" : game.mode;
  const onPinImpact = useCallback(() => play("pin"), [play]);

  useEffect(() => {
    if (game.paused) return;
    const key = `${game.gameId}:${game.phase}`;
    if (key === lastCue.current) return;
    lastCue.current = key;
    const cue = phaseCues[game.phase];
    if (cue) play(cue);
    if (game.phase === "jackpot" && game.isSeven) shoutSeven();
  }, [game.gameId, game.phase, game.isSeven, game.paused, play, shoutSeven]);

  useEffect(() => {
    if (game.entryId === lastEntry.current) return;
    lastEntry.current = game.entryId;
    if (game.entryId > 0 && !game.paused) play("entry");
  }, [game.entryId, game.paused, play]);

  useEffect(() => {
    const key = `${game.gameId}:${game.bonusRound}`;
    if (key === lastBonus.current) return;
    lastBonus.current = key;
    if (game.phase === "bonus" && !game.paused) play("bonus");
  }, [game.gameId, game.phase, game.bonusRound, game.paused, play]);

  useEffect(() => {
    const ball = game.balls.at(-1);
    if (!ball || ball.id <= lastBall.current) return;
    lastBall.current = ball.id;
    if (!game.paused) play("launch");
  }, [game.balls, game.paused, play]);

  useEffect(() => {
    if (lastPayout.current === game.payoutId) return;
    lastPayout.current = game.payoutId;
    if (game.lastPayout > 0 && !game.paused) play("prize");
  }, [game.payoutId, game.lastPayout, game.paused, play]);

  useEffect(() => {
    if (previousMode.current === game.mode) return;
    previousMode.current = game.mode;
    if (!game.paused) play(game.mode === "rush" ? "rush" : "rush-end");
  }, [game.mode, game.paused, play]);

  useEffect(() => {
    if (game.paused) stopAll();
    setAmbience(ambience);
  }, [game.paused, ambience, setAmbience, stopAll]);

  const launch = useCallback(() => {
    if (!game.canLaunch) return;
    unlock();
    launchBall();
  }, [game.canLaunch, launchBall, unlock]);

  const toggleFiring = useCallback(() => {
    if (!assets.ready || game.paused || game.preview || game.ballsOwned <= 0) return;
    unlock();
    if (game.firing) play("stop-fire");
    setFiring(!game.firing);
  }, [assets.ready, game.paused, game.preview, game.ballsOwned, game.firing, setFiring, unlock, play]);

  const push = useCallback(() => {
    if (game.phase !== "push" || game.paused) return;
    unlock();
    play("push");
    resolvePush();
  }, [game.phase, game.paused, resolvePush, unlock, play]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("button, a, input, textarea, select, summary"))) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (game.phase === "push") push();
        else toggleFiring();
      } else if (event.code === "KeyP") {
        event.preventDefault();
        if (game.paused) unlock();
        setPaused(!game.paused);
      } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        setPower(game.power + (event.code === "ArrowRight" ? 3 : -3));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game.phase, game.paused, game.power, setPaused, setPower, unlock, push, toggleFiring]);

  const firingDisabled = !assets.ready || game.paused || game.preview || game.ballsOwned <= 0;
  const activeSpin = !["idle", "bonus", "jackpot"].includes(game.phase);
  const visibleTrayBalls = game.ballsOwned === 0 ? 0 : Math.min(trayBalls.length, Math.max(3, Math.ceil(game.ballsOwned / 60)));

  return (
    <main className={styles.page} data-phase={game.phase} data-heat={game.heat} data-mode={game.mode} data-paused={game.paused} data-preview={game.preview}>
      <div className={styles.pageGlow} aria-hidden="true" />
      <header className={styles.nav}>
        {/* Full navigation disposes the machine timers and sound. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={styles.back}><ArrowLeft size={15} /><span>YG TEAM <small>ARCADE</small></span></a>
        <div className={styles.navTools}>
          <span className={styles.virtualTag}>VIRTUAL PLAY</span>
          <button type="button" className={styles.sound} onClick={audio.toggleSound} aria-pressed={audio.enabled} aria-label={audio.enabled ? "サウンドをオフにする" : "サウンドをオンにする"}>
            {audio.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>{audio.enabled ? "音 ON" : "音 OFF"}</span>
          </button>
          <button type="button" className={styles.pauseButton} onClick={() => { if (game.paused) unlock(); setPaused(!game.paused); }} aria-pressed={game.paused} aria-label={game.paused ? "遊技を再開する" : "遊技を一時停止する"}>
            {game.paused ? <Play size={15} /> : <Pause size={15} />}<span>{game.paused ? "再開" : "休憩"}</span>
          </button>
        </div>
      </header>

      <div className={styles.intro}>
        <div><p className={styles.kicker}><i /> YG ORIGINAL PACHINKO</p><h1>その一球が、<em>逆転</em>を呼ぶ。</h1></div>
        <p className={styles.introNote}>光る盤面。響く歓声。<br />勝負は、ここからだ。</p>
      </div>

      <div className={styles.arcadeLayout}>
        <div className={styles.machineColumn}>
          <section className={styles.dataCounter} aria-label="遊技データカウンター">
            <div className={styles.dataModel}><span>YG DATA</span><strong>009</strong><small>LIGHT TYPE</small></div>
            <div className={styles.dataMain}><span>大当り</span><strong>{String(game.jackpots).padStart(2, "0")}</strong></div>
            <div className={styles.dataSmall}><span>総回転</span><strong>{String(game.completed).padStart(3, "0")}</strong><small>START</small></div>
            <div className={styles.dataSmall}><span>最高連チャン</span><strong>{String(game.maxChain).padStart(2, "0")}</strong><small>MAX CHAIN</small></div>
            <div className={styles.counterGraph} data-active={game.firing} aria-hidden="true"><span>{game.mode === "rush" ? "RUSH" : game.firing ? "ON AIR" : "STANDBY"}</span><div>{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ "--led-i": i } as CSSProperties} />)}</div></div>
          </section>

          <section className={styles.machine} aria-label="YG NIGHT STADIUM パチンコ台">
            <div className={styles.cabinetLeds} aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ "--led-i": index } as CSSProperties} />)}</div>
            <div className={styles.crown}>
              <span className={styles.machineMark}><svg viewBox="0 0 52 52" fill="none" aria-hidden="true"><path d="m4 18 10 23h24l10-23-13 8-9-19-9 19-13-8Z" /><path d="M15 46h22M17 35h18" /></svg></span>
              <div><span className={styles.crownEyebrow}>THE ULTIMATE NIGHT GAME</span><h2>NIGHT <strong>STADIUM</strong></h2><span className={styles.crownSub}>逆 転 の 一 球</span></div>
              <span className={styles.series}>YG<small>99</small></span>
            </div>

            <PachinkoBoard game={game} assets={assets} reducedMotion={reducedMotion} onImpact={onPinImpact} />

            <div className={styles.controlDeck}>
              <div className={styles.holdArea}>
                <div className={styles.holdLabel}><span>保留</span><small>{game.holds.length} / {HOLD_CAPACITY}</small></div>
                <span className={styles.activeHold} data-active={activeSpin} data-heat={game.heat} aria-label={activeSpin ? `変動中・${heatNames[game.heat]}` : "変動待ち"}><i /><small>変動中</small></span>
                <span className={styles.holdDivider} aria-hidden="true" />
                <div className={styles.holds} role="list" aria-label="保留一覧">
                  {Array.from({ length: HOLD_CAPACITY }, (_, index) => {
                    const hold = game.holds[index];
                    return <span key={hold?.id ?? `empty-${index}`} role="listitem" className={styles.hold} data-filled={!!hold} data-heat={hold?.heat ?? "normal"} aria-label={hold ? `${index + 1}個目：${heatNames[hold.heat]}` : `${index + 1}個目：空き`}><i /><small>{index + 1}</small></span>;
                  })}
                </div>
              </div>

              <div className={styles.modeStrip} data-right={rightPlay}>
                <span><i />{game.preview ? "演出体験中" : game.phase === "bonus" ? `${game.bonusRoundsTotal}R 大当り` : game.mode === "rush" ? "逆転 RUSH" : "通常遊技"}</span>
                <strong>{rightPlay ? <><ChevronRight size={15} />右打ち</> : <>左を狙え<ArrowUpRight size={13} /></>}</strong>
                {game.mode === "rush" && <small>残り <b>{game.rushRemaining}</b> 回</small>}
              </div>

              <div className={styles.upperTray} data-payout={game.phase === "bonus"} aria-hidden="true">
                <span>UPPER TRAY</span>
                <div className={styles.trayBowl}>{trayBalls.slice(0, visibleTrayBalls).map((style, index) => <i key={index} style={style} />)}</div>
                <div className={styles.ballMeter}><small>持ち玉</small><strong>{format(game.ballsOwned)}</strong><span>BALLS</span></div>
              </div>

              <div className={styles.mainControls}>
                <div className={styles.firingControl}>
                  <button type="button" className={styles.launch} data-firing={game.firing} disabled={firingDisabled} onClick={toggleFiring} aria-pressed={game.firing}>
                    {game.firing ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}<span>{game.firing ? "発射を止める" : "打ち始める"}<small>{game.firing ? "発射中 · 100 球 / 分" : "ハンドルを回して、勝負開始"}</small></span>
                  </button>
                  <button type="button" className={styles.singleLaunch} disabled={!game.canLaunch || game.firing || game.preview} onClick={launch}><CircleDot size={13} />1 球だけ打つ</button>
                </div>
                <button className={styles.push} type="button" disabled={game.phase !== "push" || game.paused} onClick={push} aria-label="PUSHを押して勝負の結果を見る"><span>PUSH</span><small>{game.phase === "push" ? "押せ！" : "CHANCE BUTTON"}</small></button>
                <div className={styles.handleArea}>
                  <div className={styles.handle} data-firing={game.firing} style={{ "--handle-angle": `${-45 + game.power * 1.35}deg` } as CSSProperties} role="slider" tabIndex={0} aria-label="回転ハンドル・発射強度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={game.power}
                    onPointerDown={(event) => { handleDrag.current = { x: event.clientX, y: event.clientY, power: game.power }; event.currentTarget.setPointerCapture(event.pointerId); }}
                    onPointerMove={(event) => { const drag = handleDrag.current; if (drag) setPower(Math.round(drag.power + (event.clientX - drag.x - event.clientY + drag.y) * .8)); }}
                    onPointerUp={(event) => { handleDrag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
                    onPointerCancel={() => { handleDrag.current = null; }}
                    onLostPointerCapture={() => { handleDrag.current = null; }}
                    onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); setPower(event.key === "Home" ? 0 : event.key === "End" ? 100 : game.power + (["ArrowRight", "ArrowUp"].includes(event.key) ? 3 : -3)); } }}
                  ><i className={styles.handleTick} aria-hidden="true" /><div className={styles.handleGrip} aria-hidden="true"><i /><b>YG</b><small>POWER</small></div><span aria-hidden="true" /></div>
                  <span className={styles.handleLabel}>発射強度 <strong>{game.power}</strong></span>
                </div>
              </div>

              <div className={styles.powerControl}>
                <label htmlFor="pachinko-power"><Gauge size={14} /><span>弱</span></label>
                <div className={styles.powerTrack} data-right={rightPlay}><span className={styles.sweetSpot} aria-hidden="true" /><input id="pachinko-power" type="range" min="0" max="100" value={game.power} onChange={(event) => game.setPower(Number(event.target.value))} aria-label="発射強度" aria-valuetext={`${game.power}、${rightPlay ? "右打ちは88前後がおすすめ" : "通常は55前後がおすすめ"}`} /></div>
                <span>強</span><small>{rightPlay ? "右打ち目安 88" : "左打ち目安 55"}</small>
              </div>
              <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{game.paused ? "休憩中です。再開すると遊技が続きます。" : assets.ready ? game.status : "9人の図柄を読み込んでいます。"}</p>
              <div className={styles.deckBottom}><span><i />遊技専用・無料</span><span>YG ORIGINAL / 009</span><span>賞球 3 & 5 & 15</span></div>
            </div>
            {game.paused && <div className={styles.pauseShade}><Pause size={30} /><strong>ちょっと、ひと休み。</strong><span>遊技は一時停止しています</span><button type="button" onClick={() => { audio.unlock(); game.setPaused(false); }}><Play size={16} fill="currentColor" />遊技を再開する</button></div>}
          </section>

          <div className={styles.lowerTray} aria-hidden="true"><span>YG NIGHT STADIUM</span><i /><small>FOR THE TEAM. FOR THE GAME.</small></div>
          <p className={styles.virtualNote}>無料のバーチャルパチンコです。持ち玉の換金・景品交換はありません。</p>
        </div>

        <aside className={styles.sidePanel} aria-label="遊技情報と遊び方">
          <section className={styles.sessionCard}>
            <p className={styles.panelEyebrow}>YOUR SESSION <span>遊技データ</span></p>
            <div className={styles.balance}><span>持ち玉</span><strong>{format(game.ballsOwned)}<small>玉</small></strong></div>
            <div className={styles.sessionStats}><div><span>総払い出し</span><strong>{format(game.totalPayout)}<small>玉</small></strong></div><div><span>現在の連チャン</span><strong>{game.chain}<small>連</small></strong></div><div><span>打ち出した玉</span><strong>{format(game.totalLaunched)}<small>玉</small></strong></div><div><span>大当り回数</span><strong>{game.jackpots}<small>回</small></strong></div></div>
            <button type="button" className={styles.refillButton} disabled={game.ballsOwned > 0 || game.preview} onClick={() => { audio.unlock(); game.refill(); }}><RotateCcw size={15} />{game.ballsOwned === 0 ? "無料で 2,500 玉を補給" : "持ち玉がなくなったら無料補給"}</button>
            <p className={styles.sessionNote}>この遊技中の記録です。ページを離れるとリセットされます。</p>
          </section>

          <section className={styles.specCard}>
            <div className={styles.specHeading}><Trophy size={18} /><div><small>MACHINE SPEC</small><h2>逆転をつかめ。</h2></div><span>99</span></div>
            <dl className={styles.specList}><div><dt>通常時 大当り確率</dt><dd>1<span>/</span>99.9</dd></div><div><dt>RUSH中 大当り確率</dt><dd>1<span>/</span>39.9</dd></div><div><dt>RUSH 突入率</dt><dd>50<small>%</small></dd></div><div><dt>ST 回数</dt><dd>50<small>回</small></dd></div><div><dt>大当り出玉</dt><dd className={styles.payoutSpec}>5R 750 <span>/</span> 10R 1,500<small>玉</small></dd></div></dl>
            <div className={styles.rushNote}><Zap size={17} /><p><strong>当てるたび、ST 50 回へ。</strong><span>RUSH・大当り中は右打ちで勝負。</span></p></div>
          </section>

          <section className={styles.guideCard}>
            <p className={styles.panelEyebrow}><Info size={14} /> HOW TO PLAY</p>
            <ol><li><b>01</b><p><strong>打ち始める</strong><span>発射強度を調整して、玉を START へ。連続発射はいつでも止められます。</span></p></li><li><b>02</b><p><strong>3つの図柄を揃えろ</strong><span>保留は最大4つ。リーチの先は野球勝負。PUSH で一打を決めよう。</span></p></li><li><b>03</b><p><strong>大当りは右打ち</strong><span>アタッカーに玉を入れて出玉を獲得。RUSH 突入で連チャンを狙え。</span></p></li></ol>
            <div className={styles.holdLegend}><span><i />白保留</span><span><i />赤・チャンス</span><span><i />金・激アツ</span></div>
          </section>

          <section className={styles.experienceCard}><Sparkles size={22} /><div><h2>一度、大当りを見てみる？</h2><p>遊技記録に加算されない演出体験。</p></div><button type="button" disabled={!game.canPreview || !assets.ready || game.paused} onClick={() => { audio.unlock(); game.previewJackpot(); }}>演出体験<ChevronRight size={15} /></button>{!game.canPreview && !game.preview && <small>発射を止めて、玉と保留がなくなると体験できます。</small>}</section>

          <details className={styles.settingsCard}><summary><Keyboard size={16} />音量・キーボード操作<ChevronRight size={14} /></summary><div><label htmlFor="pachi-volume"><Volume2 size={14} />音量 <span>{Math.round(audio.volume * 100)}%</span></label><input id="pachi-volume" type="range" min="0" max="100" value={Math.round(audio.volume * 100)} onChange={(event) => audio.setVolume(Number(event.target.value) / 100)} /><p><kbd>Space</kbd> 発射 / 停止・PUSH<br /><kbd>←</kbd><kbd>→</kbd> 発射強度 <kbd>P</kbd> 休憩 / 再開</p></div></details>
        </aside>
      </div>

      <div className={styles.mobileDock} aria-label="クイック操作"><span><small>持ち玉</small><strong>{format(game.ballsOwned)}</strong></span>{game.ballsOwned <= 0 && !game.preview ? <button type="button" onClick={game.refill}><RotateCcw size={15} />無料補給</button> : <button type="button" data-active={game.firing} disabled={firingDisabled} onClick={toggleFiring}>{game.firing ? <Pause size={15} /> : <Play size={15} />}{game.firing ? "発射停止" : "打ち始める"}</button>}{game.phase === "push" && <button type="button" className={styles.dockPush} disabled={game.paused} onClick={push}>PUSH!</button>}</div>
      <footer className={styles.gameFooter}><span>YG TEAM ARCADE</span><span>ONE BALL. ONE CHANCE.</span><span>009 / NIGHT STADIUM</span></footer>
    </main>
  );
}
