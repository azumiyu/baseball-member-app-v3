"use client";

/* eslint-disable @next/next/no-img-element -- Reuse the supplied local game artwork. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Flag, Ticket as TicketIcon, Trophy } from "lucide-react";
import { createEntityId } from "@/lib/entity-id";
import {
  BET_TYPES, INITIAL_BALANCE, MAX_BALANCE, formatYen, quoteOdds, ticketPayout, ticketWins,
  type HorseRaceState, type Ticket,
} from "@/lib/games/horse-racing";
import { GameLeaderboard } from "./GameLeaderboard";
import { GameAccessState, GameShell } from "./GameShell";
import { useGameApi, type GameAction } from "./useGameApi";
import shared from "./Games.module.css";
import styles from "./HorseRacing.module.css";

const GAME_ID = "nagayasu-horse-racing";
const oddsLabel = (tenths: number) => `${(tenths / 10).toFixed(1)}倍`;
const betDefinition = (type: Ticket["type"]) => BET_TYPES.find((bet) => bet.id === type)!;
function combination(ticket: Pick<Ticket, "type" | "selection">) {
  const definition = betDefinition(ticket.type);
  return ticket.selection.map((number) => `${number}${definition.frames ? "枠" : "番"}`).join(definition.ordered ? " → " : " − ");
}

/** Positive variable speed allows overtakes, but each finish time is fixed by the server's order. */
function racePosition(elapsed: number, rank: number, number: number) {
  const fraction = Math.min(1, elapsed / (7400 + rank * 115));
  if (fraction === 1) return 1;
  const phase = number * 2.399;
  return fraction + 0.68 / (4 * Math.PI) * (Math.cos(phase) - Math.cos(4 * Math.PI * fraction + phase));
}

function RaceCourse({ race, animate, onFinish }: { race: HorseRaceState; animate: boolean; onFinish: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 300 : 9300;
    const started = performance.now();
    let frame = 0;
    let painted = -100;
    function tick(now: number) {
      const time = now - started;
      if (time >= duration) { onFinish(); return; }
      if (time - painted >= 40) { setElapsed(reduced ? 0 : time); painted = time; }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, onFinish]);

  const finished = race.phase === "result" && !animate;
  const positions = race.horses.map((horse) => {
    const rank = race.order.indexOf(horse.number);
    return { horse, rank, progress: finished ? 1 : animate ? racePosition(elapsed, rank, horse.number) : 0 };
  });
  const liveOrder = [...positions].sort((a, b) => b.progress - a.progress || a.rank - b.rank);
  const leader = liveOrder[0]?.horse;
  const call = finished ? "ゴーーール！馬ども、おつかれ！！" : !animate ? "馬ども、準備はいいかーっ！" : elapsed < 1400 ? "ゲートオープン！一斉にスタート！" : elapsed < 4700 ? `${leader?.number}番が前へ！まだまだわからんぞ！` : elapsed < 7000 ? `最後の直線！${leader?.name}、踏んばれーっ！` : "うおおお！最後まで走れ！馬どもーー！！";
  return <section className={styles.course} aria-label="15頭のレース実況">
    <div className={styles.courseHeader}><span>NAGAYASU RACECOURSE</span><strong>{finished ? "FINISH" : animate ? "LIVE" : "まもなく出走"}</strong></div>
    <div className={styles.liveRanks} aria-label={animate ? "現在の上位3頭" : "上位3頭"}>
      {(animate || finished) ? liveOrder.slice(0, 3).map(({ horse }, index) => <span key={index}>{index + 1}位 <b>{horse.number}番</b></span>) : <span>芝 1,600m ・ 15頭立て ・ 波乱歓迎！</span>}
    </div>
    <div className={styles.lanes} aria-hidden="true">
      {positions.map(({ horse, progress }) => <div className={styles.lane} key={horse.number}>
        <span className={styles.saddle} data-frame={horse.frame}>{horse.number}</span>
        <div className={styles.rail}><i className={styles.finishLine} /><div className={`${styles.runner} ${animate ? styles.gallop : ""}`} style={{ left: `${Math.min(1, Math.max(0, progress)) * 100}%` }}><span>🐎</span><b data-frame={horse.frame}>{horse.number}</b></div></div>
        <small>{animate || finished ? liveOrder.findIndex((item) => item.horse.number === horse.number) + 1 : "–"}</small>
      </div>)}
    </div>
    <p className={styles.announcer} role="status">{call}</p>
    {animate && <button type="button" className={styles.skip} onClick={onFinish}>結果へスキップ</button>}
  </section>;
}

export function HorseRacingPage() {
  const api = useGameApi<HorseRaceState>(GAME_ID);
  const [type, setType] = useState<Ticket["type"]>("win");
  const [selection, setSelection] = useState<number[]>([1]);
  const [amountText, setAmountText] = useState("10000");
  const [animationKey, setAnimationKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const requestBusy = useRef(false);
  const pendingAction = useRef<GameAction | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const run = api.snapshot?.run;
  const race = run?.lastResult;
  const balance = run?.balance ?? INITIAL_BALANCE;
  const definition = betDefinition(type);
  const animating = animationKey !== null;
  const settled = race?.phase === "result" && !animating;
  const locked = api.busy || api.retryPending || animating;
  const amount = /^\d+$/.test(amountText) ? Number(amountText) : 0;
  const validAmount = Number.isSafeInteger(amount) && amount >= 1 && amount <= balance;
  const odds = useMemo(() => {
    if (!race || race.phase !== "betting") return 0;
    try { return quoteOdds(race.horses, type, selection); } catch { return 0; }
  }, [race, type, selection]);
  const expected = validAmount && odds ? ticketPayout({ id: "preview", type, selection, amount, oddsTenths: odds }) : 0;
  const finishAnimation = useCallback(() => setAnimationKey(null), []);

  useEffect(() => { if (settled) resultRef.current?.focus({ preventScroll: true }); }, [settled]);

  async function request(action?: GameAction) {
    if (requestBusy.current || animating) return;
    requestBusy.current = true;
    if (action) pendingAction.current = action;
    const requested = pendingAction.current;
    try {
      const next = await api.act(action);
      if (!next) return;
      pendingAction.current = null;
      if (requested?.action === "horse-race" && next.run?.lastResult?.phase === "result") {
        setAnimationKey(next.run.lastRequestId);
        setNotice("");
      } else if (requested?.action === "horse-buy" && next.run?.lastRequestId === requested.requestId) {
        setNotice(`${betDefinition(requested.type).label} ${combination(requested)}・${formatYen(requested.amount)}を購入しました。`);
      } else {
        setNotice("");
      }
    } finally { requestBusy.current = false; }
  }

  function start() {
    if (locked) return;
    void request({ action: "start", gameId: GAME_ID, requestId: createEntityId(), runId: run?.id ?? null, turn: run?.turn ?? 0 });
  }
  function advance(action: "horse-race" | "horse-next") {
    if (!run || locked) return;
    void request({ action, gameId: GAME_ID, requestId: createEntityId(), runId: run.id, turn: run.turn });
  }
  function buy() {
    if (!run || !validAmount || !odds || locked || race?.phase !== "betting") return;
    void request({ action: "horse-buy", gameId: GAME_ID, requestId: createEntityId(), runId: run.id, turn: run.turn, type, selection, amount });
  }
  function changeType(next: Ticket["type"]) {
    setType(next);
    setSelection([]);
    setNotice("");
  }

  if (api.loading || api.unauthorized || !api.snapshot) return <GameShell isGame><GameAccessState loading={api.loading} unauthorized={api.unauthorized} error={api.error} onRetry={() => { void api.read(); }} /></GameShell>;

  const bought = race?.tickets.reduce((total, ticket) => total + ticket.amount, 0) ?? 0;
  const shownBalance = animating && race ? race.balanceBefore : balance;
  return <GameShell isGame memberName={api.snapshot.member.name}>
    <div className={`${shared.gameHeading} ${styles.heading}`}><p>NAGAYASU’S HORSE RACING</p><h1>長安の走れ！<span>馬ども！</span></h1><small>15頭の大騒ぎ。100万円から夢の1000兆円へ。</small></div>
    <section className={shared.machine} aria-label="長安の競馬ミニゲーム">
      <div className={`${shared.scoreboard} ${styles.balance}`}><div><span>現在の所持金</span><strong title={`${shownBalance.toLocaleString("ja-JP")}円`}>{formatYen(shownBalance)}</strong></div><div className={shared.round}><span>RACE</span><strong>{race?.race ?? 1}</strong></div></div>
      <div className={styles.hero}><img className={styles.heroArt} src="/game/nagayasu.PNG" alt="レースを盛り上げる長安" /><div><small>本日の実況：長安</small><p className={styles.bubble}>{animating ? "脚を回せ！夢も回せーっ！" : settled ? race.payout > 0 ? "的中だぁ！馬ども、よくやった！" : "こんな日もある！次こそ頼むぞ！" : "勘を信じろ！馬どもを信じろ！"}</p><small>ゲーム内通貨のみ。入金・換金はありません。</small></div></div>

      {race && (animating || settled) && <RaceCourse key={animationKey ?? "finished"} race={race} animate={animating} onFinish={finishAnimation} />}

      {!race && <div className={shared.controls}><button type="button" className={shared.primary} disabled={locked} onClick={start}><Flag size={20} aria-hidden="true" />{api.busy ? "出走準備中…" : "100万円で競馬スタート！"}</button><p className={shared.gameNote}>馬券は1円から。組み合わせを選んで購入し、レース開始！</p></div>}

      {race?.phase === "betting" && <>
        <div className={shared.table}>
          <h2 className={styles.sectionHeading}><Flag size={17} aria-hidden="true" />出走馬 <small>単勝オッズ</small></h2>
          <div className={styles.horseList} role="table" aria-label="出走馬15頭と単勝オッズ">
            <div className={styles.horseRow} role="row"><span role="columnheader">枠</span><span role="columnheader">馬番・馬名</span><span role="columnheader">能力</span><span role="columnheader">単勝</span></div>
            {race.horses.map((horse) => <div className={styles.horseRow} role="row" key={horse.number}>
              <span role="cell"><b className={styles.saddle} data-frame={horse.frame}>{horse.frame}</b></span>
              <span role="cell" className={styles.horseName}><b>{horse.number}</b> {horse.name}</span>
              <span role="cell" className={styles.ability} aria-label={`能力 ${horse.ability}`} title={`能力 ${horse.ability}`}><i style={{ width: `${horse.ability}%` }} /></span>
              <strong role="cell" className={horse.winOddsTenths === Math.min(...race.horses.map((entry) => entry.winOddsTenths)) ? styles.favorite : undefined}>{oddsLabel(horse.winOddsTenths)}</strong>
            </div>)}
          </div>
          <p className={styles.description}>能力が高いほど有利。でも勝負は最後までわからない！</p>
        </div>
        <div className={shared.controls}>
          <h2 className={styles.sectionHeading}><TicketIcon size={18} aria-hidden="true" />馬券を買う</h2>
          <div className={styles.betTypes} aria-label="馬券の種類">{BET_TYPES.map((bet) => <button type="button" key={bet.id} aria-pressed={type === bet.id} disabled={locked} onClick={() => changeType(bet.id)}>{bet.label}</button>)}</div>
          <p className={styles.description} id="bet-description">{definition.description}</p>
          <div className={styles.selection}>
            {Array.from({ length: definition.count }, (_, index) => <label key={`${type}-${index}`}>{definition.ordered ? `${index + 1}着` : definition.frames ? `枠 ${index + 1}` : definition.count === 1 ? "選ぶ馬" : `${index + 1}頭目`}
              <select value={selection[index] || ""} disabled={locked} aria-describedby="bet-description" onChange={(event) => { const next = [...selection]; next[index] = Number(event.target.value); setSelection(next); }}>
                <option value="">選択してください</option>
                {Array.from({ length: definition.frames ? 8 : 15 }, (_, option) => option + 1).map((number) => <option key={number} value={number} disabled={selection.some((value, slot) => slot !== index && value === number) && (!definition.frames || number === 1)}>{definition.frames ? `${number}枠（${race.horses.filter((horse) => horse.frame === number).map((horse) => horse.number).join("・")}番）` : `${number}番 ${race.horses[number - 1].name}`}</option>)}
              </select>
            </label>)}
          </div>
          <label className={styles.amount}>購入金額（円）<input type="text" inputMode="numeric" pattern="[0-9]*" value={amountText} disabled={locked} maxLength={16} aria-describedby="amount-help" onChange={(event) => setAmountText(event.target.value.replace(/[^0-9]/g, ""))} /></label>
          <div className={styles.presets}>{[1000, 10000, 100000].map((value) => <button type="button" key={value} disabled={locked || value > balance} onClick={() => setAmountText(String(value))}>{formatYen(value)}</button>)}<button type="button" disabled={locked || balance === 0} onClick={() => setAmountText(String(balance))}>全額</button></div>
          <p id="amount-help" className={styles.description}>{balance === 0 ? "全額購入済みです。馬券を確認してレースを開始！" : amount > balance ? "所持金以内の金額を入力してください。" : "1円単位で購入できます。購入後の取り消しはできません。"}</p>
          <dl className={styles.preview} aria-label="購入前の確認"><div><dt>組み合わせ</dt><dd>{definition.label} {odds ? combination({ type, selection }) : "未選択"}</dd></div><div><dt>購入金額</dt><dd>{validAmount ? formatYen(amount) : "金額を確認"}</dd></div><div><dt>確定オッズ</dt><dd>{odds ? oddsLabel(odds) : "—"}</dd></div><div><dt>想定払戻金</dt><dd>{expected ? formatYen(expected) : "—"}</dd></div></dl>
          <button type="button" className={styles.purchase} disabled={locked || !validAmount || !odds} onClick={buy}><TicketIcon size={18} aria-hidden="true" />{api.busy ? "処理中…" : "この内容で馬券を購入"}</button>
          <p className={styles.notice} role="status">{notice}</p>
        </div>
      </>}

      {settled && race && <div className={`${shared.controls} ${styles.result}`} ref={resultRef} tabIndex={-1}>
        <h2 className={styles.sectionHeading}><Trophy size={22} aria-hidden="true" />第{race.race}レース 確定！</h2>
        <div className={styles.podium}>{race.order.slice(0, 3).map((number, index) => { const horse = race.horses.find((entry) => entry.number === number)!; return <div key={number} data-place={index + 1}><span>{["🥇", "🥈", "🥉"][index]} {index + 1}着</span><strong>{number}<small>番</small></strong><b>{horse.name}</b><small>{oddsLabel(horse.winOddsTenths)}</small></div>; })}</div>
        <p>{race.payout > 0 ? "的中おめでとう！" : "今回は的中なし…馬ども、次は頼むぞ！"}</p>
        <strong className={styles.payout}>払戻 {formatYen(race.payout)}</strong>
        <p>現在の所持金 <b>{formatYen(balance)}</b></p>
        {balance === MAX_BALANCE && <p className={styles.notice}>1000兆円に到達！上限を超える払戻金は加算されません。</p>}
        {race.payout > balance - race.balanceBefore && <p className={styles.description}>上限適用後の加算額：{formatYen(balance - race.balanceBefore)}</p>}
        <details><summary>全15頭の着順</summary><ol className={styles.finishOrder}>{race.order.map((number, index) => <li key={number}>{index + 1}着：{number}番 {race.horses.find((horse) => horse.number === number)?.name}</li>)}</ol></details>
      </div>}

      {race && !animating && <div className={shared.controls}>
        <h2 className={styles.sectionHeading}><TicketIcon size={18} aria-hidden="true" />{settled ? "馬券の結果" : "購入済み馬券"}<small>{race.tickets.length}枚</small></h2>
        {race.tickets.length ? <><p className={styles.ticketSummary}>購入合計 {formatYen(bought)}</p><ul className={styles.tickets}>{race.tickets.map((ticket) => { const hit = settled && ticketWins(ticket, race.order, race.horses); return <li key={ticket.id} className={styles.ticket}><div><strong>{betDefinition(ticket.type).label} {combination(ticket)}</strong><span className={styles.ticketMeta}>{formatYen(ticket.amount)} × {oddsLabel(ticket.oddsTenths)}</span></div>{settled ? <b className={hit ? styles.hit : styles.miss}>{hit ? `的中！ ${formatYen(ticketPayout(ticket))}` : "不的中"}</b> : <span className={styles.ticketMeta}>的中時 {formatYen(ticketPayout(ticket))}</span>}</li>; })}</ul></> : <p className={styles.empty}>馬券を購入すると、ここに表示されます。</p>}
        <div className={styles.actions}>{race.phase === "betting" ? <button type="button" className={shared.primary} disabled={locked || !race.tickets.length} onClick={() => advance("horse-race")}><Flag size={20} aria-hidden="true" />{api.busy ? "処理中…" : "走れ！馬ども！ レース開始"}</button> : balance === 0 ? <><p>所持金が0円になりました。もう一度、夢の大勝負！</p><button type="button" className={shared.primary} disabled={locked} onClick={start}>100万円で最初から再挑戦</button></> : <button type="button" className={shared.primary} disabled={locked} onClick={() => advance("horse-next")}>次のレースへ <Flag size={18} aria-hidden="true" /></button>}</div>
        <p className={shared.gameNote}>所持金の上限は1000兆円。オッズは購入時に確定します。<br />馬券・所持金・結果は自動保存。次回も続きから遊べます。</p>
      </div>}
      {api.error && <div className={shared.controls}><div className={shared.error} role="alert"><p>{api.error}</p>{api.retryPending && <button type="button" disabled={api.busy} onClick={() => { void request(); }}>同じ操作を再試行</button>}</div></div>}
    </section>
    <details className={shared.rules}><summary>遊び方・馬券のルール<ChevronDown size={17} aria-hidden="true" /></summary><div className={shared.rulesBody}><p>馬券の種類、馬（枠）、金額を選び、購入内容を確認して購入。複数枚買ったら「レース開始」で勝負！人気薄の大逆転もあります。</p><dl>{BET_TYPES.map((bet) => <div key={bet.id}><dt>{bet.label}</dt><dd>{bet.description}</dd></div>)}</dl><p>1枠は1番、2〜8枠は2頭ずつ。枠連では2〜8枠の同じ枠同士も購入できます。毎レース能力を抽選し、その能力に応じた確率で15頭の着順を決定します。</p><p>オッズは的中確率から計算するゲーム独自の固定倍率です。払戻金は購入金額を含み、1円未満切り捨て。馬券ごと・合計の払戻表示と所持金は1000兆円を上限とします。</p><p>レース終了後の所持金で自己ベストを更新。所持金が0円になったら100万円から再挑戦できます。</p><a className={styles.rulesLink} href="https://www.jra.go.jp/kouza/beginner/baken/" target="_blank" rel="noreferrer">馬券の基本ルール（JRA）</a></div></details>
    {!animating && <GameLeaderboard entries={api.snapshot.leaderboard} personalBest={api.snapshot.personalBest} memberId={api.snapshot.member.id} />}
  </GameShell>;
}
