"use client";

import { type CSSProperties } from "react";
import { ArrowRight, CircleDot, RotateCcw } from "lucide-react";
import { BaseballShow } from "./BaseballShow";
import { SymbolDisplay } from "./SymbolDisplay";
import { PachinkoBallField } from "./PachinkoBallField";
import { BOARD_PINS, RAIL_INNER_PATH, RAIL_OUTER_PATH } from "./pachinko-physics";
import type { PachinkoGame } from "./usePachinkoGame";
import type { usePachinkoAssets } from "./usePachinkoAssets";
import styles from "./PachinkoPage.module.css";

const confetti = Array.from({ length: 24 }, (_, index) => ({
  left: `${4 + index * 4}%`, animationDelay: `${index % 7 * .13}s`,
  "--fall-drift": `${index % 2 ? 42 : -38}px`,
  "--confetti-color": ["#ffd96e", "#f7fdff", "#ff4559", "#53d9ff"][index % 4],
} as CSSProperties));
const ledAngles = Array.from({ length: 48 }, (_, index) => index * 7.5);

export function PachinkoBoard({ game, assets, reducedMotion, onImpact }: {
  game: PachinkoGame;
  assets: ReturnType<typeof usePachinkoAssets>;
  reducedMotion: boolean;
  onImpact?: () => void;
}) {
  const reach = ["reach", "super-intro", "pitch", "swing", "push", "revival"].includes(game.phase);
  const superScene = ["super-intro", "pitch", "swing", "push"].includes(game.phase);
  const celebration = game.phase === "jackpot" || game.phase === "bonus";
  const rightPlay = game.mode === "rush" || game.phase === "bonus";
  const heatLabel = game.heat === "hot" ? "激アツ" : game.heat === "chance" ? "CHANCE UP" : "勝負の一球";

  return (
    <div className={styles.board} data-reach={reach} data-celebration={celebration} data-right={rightPlay}>
      <svg className={styles.pinfield} viewBox="0 0 600 620" aria-hidden="true">
        <defs>
          <linearGradient id="pachi-chrome" x1="0" y1="0" x2="1" y2=".6"><stop stopColor="#09111c" /><stop offset=".12" stopColor="#8795a6" /><stop offset=".19" stopColor="#f0f7fc" /><stop offset=".29" stopColor="#43515f" /><stop offset=".46" stopColor="#121e2a" /><stop offset=".55" stopColor="#c8d6dd" /><stop offset=".61" stopColor="#fbffff" /><stop offset=".7" stopColor="#4e5a69" /><stop offset="1" stopColor="#121a27" /></linearGradient>
          <linearGradient id="pachi-gold" x1="0" y1="0" x2=".9" y2="1"><stop stopColor="#fff8cc" /><stop offset=".3" stopColor="#e9b83e" /><stop offset=".48" stopColor="#6b4218" /><stop offset=".52" stopColor="#ffe99b" /><stop offset="1" stopColor="#9a6b1d" /></linearGradient>
          <radialGradient id="pachi-pin"><stop stopColor="#fff" /><stop offset=".4" stopColor="#d0e4f2" /><stop offset=".7" stopColor="#697785" /><stop offset="1" stopColor="#1c2935" /></radialGradient>
          <radialGradient id="pachi-glass"><stop stopColor="#112c4e" stopOpacity=".25" /><stop offset=".82" stopColor="#070e1b" stopOpacity=".05" /><stop offset="1" stopColor="#000" stopOpacity=".7" /></radialGradient>
        </defs>
        <ellipse cx="300" cy="297" rx="290" ry="294" fill="#050910" stroke="url(#pachi-chrome)" strokeWidth="19" />
        <ellipse cx="300" cy="297" rx="275" ry="280" fill="url(#pachi-glass)" stroke="#b9183d" strokeWidth="8" />
        <ellipse cx="300" cy="297" rx="269" ry="274" fill="none" stroke="url(#pachi-gold)" strokeWidth="2" />
        {ledAngles.map((angle, index) => <g key={angle} transform={`rotate(${angle} 300 297)`}><rect className={styles.orbitLed} data-tone={index % 3} x="296.5" y="15" width="7" height="12" rx="2" style={{ "--led-i": index } as CSSProperties} /><path d="M296 31h8" stroke="#ffffff28" strokeWidth="1" /></g>)}
        <path className={styles.railOuter} d={RAIL_OUTER_PATH} />
        <path className={styles.railInner} d={RAIL_INNER_PATH} />
        <path className={styles.fieldLine} d="M177 478 300 426 423 478 300 555Z M177 478l-56 85m302-85 56 85" />
        <path d="m105 107-50 22 24 85-15 79 20 74 19-45-6-112 24-60Z" fill="#6c123e80" stroke="url(#pachi-gold)" strokeWidth="2" />
        <path d="m495 107 50 22-24 85 15 79-20 74-19-45 6-112-24-60Z" fill="#6c123e80" stroke="url(#pachi-gold)" strokeWidth="2" />
        <path d="m115 113 35-43 90 9 60-31 60 31 90-9 35 43-88-15-97 18-97-18Z" fill="url(#pachi-chrome)" stroke="url(#pachi-gold)" strokeWidth="2" />
        <path d="m148 88 73 3 30 13-78-2Zm304 0-73 3-30 13 78-2Z" fill="#d00c3c" stroke="#ff697f" />
        <g className={styles.mechanicalWing} data-active={reach || celebration}><path d="m130 391 66 3 59 40-39 11-78-22-22-14Zm340 0-66 3-59 40 39 11 78-22 22-14Z" fill="url(#pachi-chrome)" stroke="url(#pachi-gold)" strokeWidth="3" /><path d="m153 405 45 5 28 20-33-5Zm294 0-45 5-28 20 33-5Z" fill="#ab1236" stroke="#ff3556" /></g>
        <g className={styles.vEmblem} data-active={celebration}><path d="m263 398 37 21 37-21-17 54-20 18-20-18Z" fill="url(#pachi-gold)" stroke="#ffedb2" strokeWidth="2" /><path d="m280 418 20 10 20-10-14 28h-12Z" fill="#7f142c" stroke="#ff5c6a" strokeWidth="2" /></g>
        {BOARD_PINS.map((pin, index) => <g key={index}><circle className={styles.pinShadow} cx={pin.x + 1} cy={pin.y + 2} r="4.4" /><path d={`M${pin.x} ${pin.y}l-1 7`} stroke="#d9ecfc7a" strokeWidth="1.8" /><circle cx={pin.x} cy={pin.y} r={pin.r} fill="url(#pachi-pin)" stroke="#a4bbc8" strokeWidth=".45" /></g>)}
        <path className={styles.chuckerGuide} d="m268 494 12 14m52-14-12 14" />
        <path d="m53 405 10-10 10 10-10 10Z" fill="url(#pachi-gold)" /><path d="m537 405-10-10-10 10 10 10Z" fill="url(#pachi-gold)" />
        <circle cx="150" cy="565" r="16" fill="#0d2132" stroke="url(#pachi-chrome)" strokeWidth="4" /><text x="150" y="569" textAnchor="middle" fill="#88aec4" fontSize="8" fontWeight="bold">3 BALL</text>
        <path d="M242 602h116l-9 11h-98Z" fill="#020509" stroke="#44525f" />
      </svg>

      <div className={styles.boardHeader}><span>BASEBALL BATTLE</span><b>YG</b><span>ALL STAR EDITION</span></div>
      <div className={styles.sideLamp} data-side="left" aria-hidden="true"><span>F</span><span>I</span><span>G</span><span>H</span><span>T</span></div>
      <div className={styles.sideLamp} data-side="right" aria-hidden="true"><span>W</span><span>I</span><span>N</span><span>！</span></div>

      <div className={styles.lcd} data-super={superScene} data-jackpot={game.phase === "jackpot"} data-bonus={game.phase === "bonus"} data-reach={reach}>
        <div className={styles.stadium} aria-hidden="true"><div className={styles.stands} /><div className={styles.diamond} /><div className={styles.spotlights}><i /><i /><i /><i /></div></div>
        <div className={styles.screenTop}><span><i />{game.preview ? "演出体験 / DEMONSTRATION" : game.mode === "rush" ? "逆転 RUSH" : "LIVE / NIGHT STADIUM"}</span><span>{game.mode === "rush" ? `ST ${game.rushRemaining}` : `${String(game.completed).padStart(3, "0")} GAME`}</span></div>
        <div className={styles.symbolArea} data-jackpot={game.phase === "jackpot"} data-bonus={game.phase === "bonus"}><SymbolDisplay symbols={game.symbols} moving={game.moving} reach={reach} jackpot={game.phase === "jackpot"} dimmed={superScene || game.phase === "bonus" || game.phase === "revival"} /></div>
        {game.phase === "idle" && assets.ready && <p className={styles.readyTag}>{game.mode === "rush" ? "右打ちで、もう一度つかめ。" : "打ち始めて、勝負の一球を。"}</p>}
        {game.phase === "chance" && <div key={game.gameId} className={styles.chance}>CHANCE<small>球場の空気が、変わった。</small></div>}
        {game.phase === "reach" && <div className={styles.reachTitle}>REACH<small>あと一人で、流れが変わる。</small></div>}
        {superScene && <span className={styles.heatBadge}>{heatLabel}</span>}
        {game.phase === "freeze" && <div className={styles.freeze} aria-hidden="true" />}
        {game.phase === "miss" && <p className={styles.miss}>NEXT CHANCE<small>次の一球に、願いを。</small></p>}
        {game.phase === "revival" && <div className={styles.crack} aria-hidden="true"><i /><i /><i /></div>}
        {game.phase === "jackpot" && <><div key={`win-${game.gameId}`} className={styles.winFlash} aria-hidden="true" /><p className={styles.jackpotLabel}>大当り！</p><div className={styles.confetti} aria-hidden="true">{confetti.map((style, index) => <i key={index} style={style} />)}</div></>}
        <BaseballShow phase={game.phase} heat={game.heat} symbols={game.symbols} isSeven={game.isSeven} revived={game.revived} bonusRound={game.bonusRound} bonusRoundsTotal={game.bonusRoundsTotal} bonusHits={game.bonusHits} roundPayout={game.bonusHits * 15} attackerOpen={game.attackerOpen} rushEntry={game.rushEntry} />
        {!assets.ready && <div className={styles.loading} role="status"><CircleDot size={28} strokeWidth={1} /><strong>{assets.failed.length ? "図柄を読み込めませんでした" : "球場を準備しています"}</strong><span>{assets.loaded} / {assets.total} 図柄</span><div className={styles.loadTrack}><i style={{ width: `${assets.loaded / assets.total * 100}%` }} /></div>{assets.failed.length > 0 && <button type="button" onClick={assets.retry}><RotateCcw size={14} />再読み込み</button>}</div>}
        <div className={styles.screenBottom}><span>{game.preview ? "遊技記録への加算なし" : "LEFT → RIGHT → CENTER"}</span><span>{game.phase === "bonus" ? `${game.bonusRoundsTotal}R BONUS` : "YG BASEBALL EDITION"}</span></div>
      </div>

      <div className={styles.shotGuide} data-right={rightPlay}><span>{rightPlay ? "RIGHT SHOT" : "START"}</span><strong>{rightPlay ? <>右打ち<ArrowRight size={16} /></> : "左を狙え"}</strong>{game.mode === "rush" && <small>ST 残り {game.rushRemaining} 回</small>}</div>
      <div className={styles.chucker}>{game.entryId > 0 && <span key={game.entryId} className={styles.entryFlash} aria-hidden="true" />}<div className={styles.chuckerMouth} /><strong>START</strong><span>3 BALLS</span></div>
      <div className={styles.attacker} data-open={game.attackerOpen} aria-label={game.attackerOpen ? "アタッカー開放中" : "アタッカー"}><div><i /><i /><i /><i /><i /></div><span>{game.attackerOpen ? "OPEN / 15 BALLS" : "ATTACKER"}</span></div>
      <div className={styles.glassGlare} aria-hidden="true" />
      <PachinkoBallField balls={game.balls} reducedMotion={reducedMotion} paused={game.paused} className={styles.ballLayer} onImpact={onImpact} />
      {game.preview && <span className={styles.previewBadge}>DEMO / 演出体験</span>}
    </div>
  );
}
