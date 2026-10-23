import type { Heat, Phase, Symbols } from './pachinko-game';
import styles from './BaseballShow.module.css';

type BaseballShowProps = {
  phase: Phase;
  heat: Heat;
  isSeven: boolean;
  revived: boolean;
  bonusRound: number;
  bonusRoundsTotal?: number;
  bonusHits?: number;
  roundPayout?: number;
  attackerOpen?: boolean;
  rushEntry?: boolean;
  symbols?: Symbols;
};

function Pitcher() {
  return (
    <svg className={styles.pitcher} viewBox="0 0 180 230" fill="none" aria-hidden="true">
      <ellipse className={styles.playerShadow} cx="88" cy="218" rx="69" ry="9" />
      <path className={styles.uniformDark} d="m76 129 30 4-7 42-29 37-20-9 27-42-1-32Z" />
      <path className={styles.uniformLight} d="m99 129 14 1 10 44 29 33-13 13-42-38-13-38 15-15Z" />
      <path className={styles.playerOutline} d="m50 201 22 9-4 12H38l12-21Zm90 4 13 2 18 14h-34l3-16Z" />
      <path className={styles.uniformLight} d="m73 68 23-3 20 19-5 57-40 1-11-39 13-35Z" />
      <path className={styles.jerseySeam} d="m91 78 9 55M73 132l34-1" />
      <path className={styles.uniformDark} d="m74 77-20 15-20-20-11 13 26 30 24-10 1-28Z" />
      <path className={styles.glove} d="m18 59 12-7 12 12-4 20-18 5-10-15 8-15Z" />
      <g className={styles.pitchingArm}>
        <path className={styles.uniformLight} d="m97 74 27 7 23-36-14-9-23 26-11-1-2 13Z" />
        <path className={styles.skinGold} d="m133 40-5-12 6-10 13 5 3 10-6 13-11-6Z" />
        <circle className={styles.handBall} cx="139" cy="20" r="7" />
      </g>
      <path className={styles.skinGold} d="m76 51 23-1-4 20-17 1-2-20Z" />
      <path className={styles.uniformLight} d="M71 40c0-14 7-23 19-23 13 0 22 11 22 25l-8 18-20 3-11-11-2-12Z" />
      <path className={styles.playerOutline} d="M68 37c-1-16 9-27 22-27 15 0 24 11 24 27H68Z" />
      <path className={styles.capGold} d="m74 35 45 1 8 7-53-1v-7Z" />
      <path className={styles.jerseyNumber} d="M82 91h13l-9 23" />
    </svg>
  );
}

function Batter({ celebrating = false }: { celebrating?: boolean }) {
  return (
    <svg
      className={celebrating ? styles.celebratingBatter : styles.batter}
      viewBox="0 0 180 230"
      fill="none"
      aria-hidden="true"
    >
      <ellipse className={styles.playerShadow} cx="94" cy="220" rx="67" ry="8" />
      <path className={styles.uniformDark} d="m85 132 27 3-7 47 20 27-17 12-32-31 2-39 7-19Z" />
      <path className={styles.uniformLight} d="m76 127 24 12-20 46-23 31-22-8 23-41 18-40Z" />
      <path className={styles.playerOutline} d="m36 205 22 7-5 12H23l13-19Zm72 4 18-2 22 15h-39l-1-13Z" />
      <path className={styles.uniformLight} d="m76 67 21-4 25 24-14 59-41-6-6-39 15-34Z" />
      <path className={styles.jerseySeam} d="m96 78-14 55m-11 1 36 6" />
      <path className={styles.skinGold} d="m77 48 22 3-5 20-16 1-1-24Z" />
      <path className={styles.uniformLight} d="M68 38c0-15 9-25 22-25 12 0 21 11 21 25l-7 20-21 4-13-13-2-11Z" />
      <path className={styles.playerOutline} d="M66 35c0-16 9-27 24-27 15 0 24 11 24 29l-14 5-1 11-8-1-2-17H66Z" />
      <path className={styles.capGold} d="m67 32 29 1v8l-43-1 14-8Z" />
      <path className={styles.jerseyNumber} d="M101 96h12l-10 22" />
      <g className={styles.battingArms}>
        <path className={styles.uniformDark} d="m111 80-19 21-20-13-8 13 29 23 31-28-13-16Z" />
        <path className={styles.uniformLight} d="m75 76-21 24 21 20 10-11-12-13 15-12-13-8Z" />
        <path className={styles.bat} d="m74 102 38-72" />
        <path className={styles.batTip} d="m90 72 23-44" />
        <path className={styles.skinGold} d="m70 96 10-6 10 7-5 15-12-2-3-14Z" />
        <path className={styles.fistDetail} d="m76 98 9 3m-9 4 6 2" />
      </g>
    </svg>
  );
}

function VictoryPlayer() {
  return (
    <svg className={styles.victoryPlayer} viewBox="0 0 360 245" fill="none" aria-hidden="true">
      <ellipse className={styles.victoryShadow} cx="178" cy="233" rx="96" ry="9" />
      <g className={styles.victoryFigure}>
        <path className={styles.uniformDark} d="m156 161 26 3-12 41-12 24-27-2 11-31 14-35Z" />
        <path className={styles.uniformLight} d="m183 162 24-2 17 24 28-11 11 17-40 25-21-12-19-41Z" />
        <path className={styles.playerOutline} d="m134 218 25 4-2 14h-44l21-18Zm115-48 13-6 18 16-17 13-14-23Z" />
        <path className={styles.uniformLight} d="m155 86 23-6 28 7 13 78-71 1 7-80Z" />
        <path className={styles.jerseySeam} d="m181 91 1 66m-31 0h63" />
        <path className={styles.uniformLight} d="m157 91-18-6-22 22-24-52-18 10 24 65 17 9 37-28 4-20Z" />
        <path className={styles.uniformLight} d="m203 91 18-6 22 22 24-52 18 10-24 65-17 9-37-28-4-20Z" />
        <path className={styles.armSeam} d="m99 116 18 9 13-11m100 0 13 11 18-9M91 78l-13 5m191-5 13 5" />
        <path className={styles.skinGold} d="m72 67-12-17 4-17 9-4 9 4 8-2 10 10 1 12-8 15-11 5-10-6Z" />
        <path className={styles.skinGold} d="m288 67 12-17-4-17-9-4-9 4-8-2-10 10-1 12 8 15 11 5 10-6Z" />
        <path className={styles.fistDetail} d="m70 37 4 15m5-16 5 14m4-11 4 12m-23 7 12-4 9 4m200-21-4 15m-5-16-5 14m-4-11-4 12m23 7-12-4-9 4" />
        <path className={styles.skinGold} d="m166 68 28-1-2 20-12 8-13-9-1-18Z" />
        <path className={styles.uniformLight} d="M154 47c0-17 10-28 26-28s26 11 26 28l-6 23-20 10-20-10-6-23Z" />
        <path className={styles.playerOutline} d="M152 45c-1-22 10-36 28-36s29 14 28 36h-56Z" />
        <path className={styles.capGold} d="M148 42h64l9 9h-82l9-9Z" />
        <path className={styles.jerseyNumber} d="M170 112h24l-17 31" />
        <path className={styles.faceDetail} d="m169 62 11 5 11-5" />
        <path className={styles.capMark} d="m176 24 5-5 5 5-5 7-5-7Z" />
      </g>
    </svg>
  );
}

function HomeRunFlight() {
  return (
    <svg className={styles.homeRunFlight} viewBox="0 0 600 400" preserveAspectRatio="none" fill="none" aria-hidden="true">
      <path className={styles.flightGlow} d="M250 279Q387 136 554 45" />
      <path className={styles.flightTrail} d="M278 252Q410 117 554 45" />
      <path className={styles.flightFine} d="M358 205 517 69M383 211 566 76" />
      <g className={styles.flightBall}>
        <circle cx="271" cy="256" r="9" fill="#fffdf0" />
        <path d="M267 248q7 7 1 16m9-16q-6 8 0 15" stroke="#da4c36" strokeWidth="1.5" strokeDasharray="2 1" />
      </g>
      <path className={styles.flightStar} d="m547 23 3 16 17 3-17 4-3 16-4-16-16-4 16-3 4-16Z" fill="#fff2b3" />
    </svg>
  );
}

export function BaseballShow({ phase, heat, isSeven, revived, bonusRound, bonusRoundsTotal = 5, bonusHits = 0, roundPayout = 0, attackerOpen = true, rushEntry = false, symbols = [7, 7, 7] }: BaseballShowProps) {
  const isSuper = phase === 'super-intro' || phase === 'pitch' || phase === 'swing' || phase === 'push';
  const isResult = phase === 'jackpot' || phase === 'revival';
  const isComeback = revived || phase === 'revival';

  if (!isSuper && !isResult && phase !== 'bonus') return null;

  return (
    <div className={styles.show} data-phase={phase} data-heat={heat} data-seven={isSeven} aria-hidden="true">
      <div className={styles.screenTexture} />
      {isSuper && (
        <div className={styles.superScene}>
          <div className={styles.cinemaTop}><span>LAST INNING</span><b>9回裏・二死満塁</b><span>FULL COUNT</span></div>
          <div className={styles.speedLines} />
          <div className={styles.reachLabel}><span /> SUPER REACH <span /></div>
          <div className={styles.showdown}>勝負<span>！</span></div>
          <div className={styles.diamond} />
          <div className={styles.mound} />
          <Pitcher />
          <Batter />
          <div className={styles.pitchTrack}><span className={styles.pitchedBall} /></div>
          {(phase === 'swing' || phase === 'push') && <div className={styles.contactBurst} />}
          <div className={styles.superCaption}>
            <span className={styles.captionLine} />
            {phase === 'push' ? 'この一打で、決めろ。' : phase === 'swing' ? '振り抜け、その先へ。' : phase === 'pitch' ? '一球に、すべてを。' : '最終打席。奇跡を、その手で。'}
            <span className={styles.captionLine} />
          </div>
          <div className={styles.cinemaBottom}><span>逆転ホームランリーチ</span><i /><b>{phase === 'push' ? 'PUSH TO SWING' : 'ONE SWING CAN CHANGE EVERYTHING'}</b></div>
        </div>
      )}

      {isResult && (
        <div className={styles.resultScene}>
          <div className={styles.victoryRays} />
          <HomeRunFlight />
          <div className={styles.victoryAura} />
          {isSeven ? (
            <>
              <div className={styles.resultEyebrow}>{isComeback ? '逆転ホームラン！' : '777 SPECIAL CELEBRATION'}</div>
              <div className={styles.sevenCrown}>777</div>
              <div className={styles.sevenShout}>カイリキー<span>！！</span></div>
              <VictoryPlayer />
              <span className={`${styles.victorySpark} ${styles.sparkLeft}`}>✦</span>
              <span className={`${styles.victorySpark} ${styles.sparkRight}`}>✦</span>
            </>
          ) : (
            <>
              <div className={styles.resultEyebrow}>{isComeback ? 'NEVER GIVE UP' : 'INTO THE STANDS'}</div>
              <div className={styles.winningNumbers}>{symbols.map((symbol, index) => <strong key={index} data-odd={symbol % 2 === 1}>{symbol}</strong>)}</div>
              <div className={styles.homeRunTitle}>{isComeback ? '逆転ホームラン！' : 'ホームラン！'}</div>
              <Batter celebrating />
              <div className={styles.homeRunStamp}>HOME<br /><strong>RUN</strong><span>歓喜の一打</span></div>
            </>
          )}
          <div className={styles.resultAward}>{rushEntry ? '逆転 RUSH 突入' : 'BASEBALL BONUS 獲得'}<span>右打ちでアタッカーを狙え</span></div>
        </div>
      )}

      {phase === 'bonus' && (
        <div className={styles.bonusScene} data-open={attackerOpen}>
          <div className={styles.bonusKicker}>{bonusRoundsTotal === 10 ? 'RUSH SPECIAL · 1,500 BALLS' : 'HOME RUN · 750 BALLS'}</div>
          <div className={styles.bonusTitle}>BASEBALL <strong>BONUS</strong></div>
          <div className={styles.inning}><span>ROUND</span><strong>{bonusRound}<small>/ {bonusRoundsTotal}</small></strong><i /><span className={styles.roundPrize}>GET <b>{roundPayout}</b> 玉</span></div>
          <div key={bonusRound} className={styles.attacker}>
            <div className={styles.attackerTop}><span /> {attackerOpen ? 'ATTACKER OPEN' : 'ROUND COMPLETE'} <span /></div>
            <div className={styles.attackerOpening}>
              <div className={styles.gateGlow} />
              <div className={styles.slats}><i /><i /><i /><i /><i /></div>
              <div className={styles.openArrows}><span>⌄</span><span>⌄</span><span>⌄</span></div>
            </div>
            <div className={styles.attackerLip} />
          </div>
          <div className={styles.hitMeter}>{Array.from({ length: 10 }, (_, index) => <i key={index} data-hit={index < bonusHits} />)}<span>{bonusHits} / 10 入賞</span></div>
          <div className={styles.bonusCaption}>{attackerOpen ? '右打ち継続 ▶▶▶' : 'ラウンド完了！次の開放を待て'}</div>
        </div>
      )}
    </div>
  );
}
