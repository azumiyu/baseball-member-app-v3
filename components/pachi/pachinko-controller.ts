import {
  ATTACKER_PAYOUT, BONUS_HITS_PER_ROUND, BONUS_ROUNDS, createGameTicket,
  HOLD_CAPACITY, INITIAL_BALLS, MAX_BALLS_IN_FLIGHT, neighborSymbol,
  planForTicket, PRIZE_PAYOUT, randomSymbol, RUSH_BONUS_ROUNDS, RUSH_SPINS,
  START_PAYOUT, TIMINGS,
  type Ball, type GameMode, type GamePlan, type Heat, type Hold, type Phase, type Symbols,
} from "./pachinko-game";
import { createBallFlight } from "./pachinko-physics";

export interface GameOptions { ready: boolean; reducedMotion: boolean }
export interface GameView {
  phase: Phase;
  symbols: Symbols;
  moving: [boolean, boolean, boolean];
  balls: Ball[];
  holds: Hold[];
  heat: Heat;
  gameId: number;
  entryId: number;
  completed: number;
  jackpots: number;
  bonusRound: number;
  isSeven: boolean;
  revived: boolean;
  canLaunch: boolean;
  status: string;
  mode: GameMode;
  rushRemaining: number;
  ballsOwned: number;
  totalLaunched: number;
  totalPayout: number;
  firing: boolean;
  power: number;
  bonusRoundsTotal: number;
  bonusHits: number;
  attackerOpen: boolean;
  chain: number;
  maxChain: number;
  preview: boolean;
  paused: boolean;
  canPreview: boolean;
  lastPayout: number;
  payoutId: number;
  rushEntry: boolean;
}
interface OwnedTimer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
  callback: () => void;
}
export interface GameController {
  launchBall: () => void;
  push: () => void;
  refresh: () => void;
  dispose: () => void;
  setFiring: (firing: boolean) => void;
  setPower: (power: number) => void;
  setPaused: (paused: boolean) => void;
  refill: () => void;
  previewJackpot: () => void;
}
export function createInitialGameView(): GameView {
  return {
    phase: "idle", symbols: [7, 2, 7], moving: [false, false, false], balls: [], holds: [],
    heat: "normal", gameId: 0, entryId: 0, completed: 0, jackpots: 0,
    bonusRound: 0, isSeven: false, revived: false, canLaunch: false,
    status: "ハンドルを左打ちに合わせて、打ち出し開始！", mode: "normal", rushRemaining: 0,
    ballsOwned: INITIAL_BALLS, totalLaunched: 0, totalPayout: 0, firing: false, power: 56,
    bonusRoundsTotal: 0, bonusHits: 0, attackerOpen: false, chain: 0, maxChain: 0,
    preview: false, paused: false, canPreview: false, lastPayout: 0, payoutId: 0, rushEntry: false,
  };
}

/** Own all timers, pause their remaining durations, and keep inputs synchronous. */
export function createPachinkoController(
  onChange: (view: GameView) => void,
  getOptions: () => GameOptions,
  random: () => number = Math.random,
): GameController {
  let view = createInitialGameView();
  let alive = true;
  let hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  let manualPause = false;
  let nextBallId = 0;
  let cooldown = false;
  let plan: GamePlan | null = null;
  let previewSaved: GameView | null = null;
  let symbolTimer: OwnedTimer | null = null;
  let pushTimer: OwnedTimer | null = null;
  let centerSlow = false;
  let centerTicks = 0;
  let slowStep = 0;
  const timers = new Set<OwnedTimer>();
  const paused = () => hidden || manualPause;

  function arm(timer: OwnedTimer) {
    if (!alive || paused()) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => {
      timers.delete(timer);
      timer.handle = null;
      if (alive && !paused()) timer.callback();
    }, timer.remaining);
  }
  function after(delay: number, callback: () => void): OwnedTimer {
    const timer: OwnedTimer = { handle: null, remaining: delay, startedAt: 0, callback };
    if (alive) { timers.add(timer); arm(timer); }
    return timer;
  }
  function cancel(timer: OwnedTimer | null) {
    if (!timer) return;
    if (timer.handle !== null) clearTimeout(timer.handle);
    timer.handle = null;
    timers.delete(timer);
  }
  function launchAllowed() {
    return alive && getOptions().ready && !paused() && !view.preview && !cooldown &&
      view.ballsOwned > 0 && view.balls.length < MAX_BALLS_IN_FLIGHT;
  }
  function previewAllowed() {
    return alive && getOptions().ready && !paused() && !view.preview && !view.firing &&
      !cooldown && !plan && view.phase === "idle" && view.balls.length === 0 && view.holds.length === 0;
  }
  function update(patch: Partial<GameView> = {}) {
    if (!alive) return;
    view = { ...view, ...patch };
    view = { ...view, paused: paused(), canLaunch: launchAllowed(), canPreview: previewAllowed() };
    onChange(view);
  }
  function stopSymbolTicks() { cancel(symbolTimer); symbolTimer = null; }
  function tickSymbols() {
    if (!plan || !view.moving.some(Boolean)) return;
    const symbols: Symbols = [...view.symbols];
    const interval = getOptions().reducedMotion ? TIMINGS.slowSymbolTick : TIMINGS.symbolTick;
    centerTicks += interval;
    for (const index of [0, 1, 2] as const) {
      if (!view.moving[index]) continue;
      if (index === 1 && centerSlow) {
        if (centerTicks < TIMINGS.slowSymbolTick) continue;
        const target = plan.finalSymbols[0];
        const sequence = [neighborSymbol(target, -1), target, neighborSymbol(target, 1), target];
        symbols[1] = sequence[slowStep++ % sequence.length];
        centerTicks = 0;
      } else symbols[index] = randomSymbol(random);
    }
    update({ symbols });
    symbolTimer = after(interval, tickSymbols);
  }
  function recolorHolds(mode: GameMode) {
    return view.holds.map((hold) => ({ ...hold, heat: planForTicket(hold.ticket, mode).heat }));
  }
  function finishGame() {
    stopSymbolTicks(); cancel(pushTimer); pushTimer = null;
    if (view.preview && previewSaved) {
      const saved = previewSaved;
      previewSaved = null; plan = null;
      update({ ...saved, gameId: view.gameId, payoutId: view.payoutId, lastPayout: 0,
        preview: false, status: "演出体験終了。通常の遊技を開始できます。" });
      return;
    }
    let mode = view.mode;
    let rushRemaining = view.rushRemaining;
    let chain = view.chain;
    if (plan?.win) {
      mode = plan.rushEntry ? "rush" : "normal";
      rushRemaining = plan.rushEntry ? RUSH_SPINS : 0;
      if (!plan.rushEntry) chain = 0;
    } else if (plan?.mode === "rush") {
      rushRemaining = Math.max(0, rushRemaining - 1);
      if (rushRemaining === 0) { mode = "normal"; chain = 0; }
    }
    const expired = view.mode === "rush" && mode === "normal";
    view = { ...view, mode, rushRemaining, chain, holds: recolorHolds(mode), attackerOpen: false };
    plan = null;
    const [next, ...rest] = view.holds;
    if (next) { view = { ...view, holds: rest }; startGame(next); return; }
    update({ phase: "idle", moving: [false, false, false], bonusRound: 0, bonusHits: 0,
      status: expired ? "ST 50回終了。通常モードへ。左打ちで続けよう！" : mode === "rush" ? `RUSH 継続！右打ち・残り ${rushRemaining}回` : "左打ちでスタート入賞を狙おう！" });
  }
  function previewHit() {
    if (!view.preview || view.phase !== "bonus" || !view.attackerOpen) return;
    registerAttackerHit();
    if (view.attackerOpen) after(TIMINGS.previewHit, previewHit);
  }
  function beginBonus(round: number) {
    if (round > view.bonusRoundsTotal) { finishGame(); return; }
    update({ phase: "bonus", bonusRound: round, bonusHits: 0, attackerOpen: true,
      status: view.preview ? `演出体験・${round}R / ${view.bonusRoundsTotal}R` : `右打ち！ ${round}R / ${view.bonusRoundsTotal}R・アタッカー開放` });
    if (view.preview) after(TIMINGS.previewHit, previewHit);
  }
  function showJackpot() {
    if (!plan) return;
    const isSeven = plan.finalSymbols[0] === 7;
    const chain = plan.mode === "rush" ? view.chain + 1 : 1;
    update({ phase: "jackpot", symbols: [...plan.finalSymbols], moving: [false, false, false],
      completed: view.completed + (view.preview ? 0 : 1), jackpots: view.jackpots + (view.preview ? 0 : 1),
      isSeven, rushEntry: plan.rushEntry, bonusRoundsTotal: plan.mode === "rush" ? RUSH_BONUS_ROUNDS : BONUS_ROUNDS,
      chain: view.preview ? view.chain : chain, maxChain: view.preview ? view.maxChain : Math.max(view.maxChain, chain),
      status: view.preview ? "演出体験・777！ 実際の持ち玉には加算されません" : isSeven ? "777！ RUSH 突入確定！右打ちの準備！" : plan.rushEntry ? "大当り！ RUSH 突入！右打ちの準備！" : "大当り！5R BONUS！右打ちの準備！" });
    after(isSeven ? TIMINGS.sevenJackpot : TIMINGS.jackpot, () => beginBonus(1));
  }
  function showResult() {
    if (!plan) return;
    if (plan.win && !plan.revival) { showJackpot(); return; }
    const revival = plan.revival;
    update({ phase: "miss", symbols: [...plan.missSymbols], moving: [false, false, false],
      completed: view.completed + (revival || view.preview ? 0 : 1), status: plan.reach ? "あと一歩…" : "次の一球へ！" });
    if (revival) after(TIMINGS.revivalMiss, () => {
      update({ phase: "revival", revived: true, status: "まだ終わらない！逆転の一打！" });
      after(TIMINGS.revival, showJackpot);
    });
    else after(TIMINGS.miss, finishGame);
  }
  function freezeResult() {
    if (!plan) return;
    cancel(pushTimer); pushTimer = null; stopSymbolTicks();
    update({ phase: "freeze", symbols: [...(plan.revival ? plan.missSymbols : plan.finalSymbols)],
      moving: [false, false, false], status: "運命の一瞬…" });
    after(TIMINGS.freeze, showResult);
  }
  function push() {
    if (!alive || paused() || view.phase !== "push") return;
    freezeResult();
  }
  function waitForPush() {
    update({ phase: "push", status: "PUSH！ 一打に想いを込めろ！" });
    pushTimer = after(TIMINGS.pushTimeout, push);
  }
  function startSwing() { update({ phase: "swing", status: "捉えろ！勝負のフルスイング！" }); after(TIMINGS.swing, waitForPush); }
  function startPitch() { update({ phase: "pitch", status: "投手、渾身の一球！" }); after(TIMINGS.pitch, startSwing); }
  function beginSuperReach() { update({ phase: "super-intro", status: "一球入魂！逆転ホームランリーチ！" }); after(TIMINGS.superIntro, startPitch); }
  function announceReach() {
    if (!plan) return;
    centerSlow = true; centerTicks = 0; slowStep = 0;
    update({ phase: "reach", status: "リーチ！中央図柄に注目！" });
    after(plan.superReach ? TIMINGS.superReachLead : TIMINGS.normalReach, plan.superReach ? beginSuperReach : freezeResult);
  }
  function beginVariation() {
    if (!plan) return;
    update({ phase: "varying", moving: [true, true, true], status: view.mode === "rush" ? "RUSH！右打ち高速変動！" : "スタート入賞！図柄変動開始" });
    tickSymbols();
    const speed = plan.mode === "rush" && !plan.reach ? 0.48 : 1;
    after(TIMINGS.leftStop * speed, () => {
      if (!plan) return;
      update({ phase: "left-stop", symbols: [plan.finalSymbols[0], view.symbols[1], view.symbols[2]], moving: [false, true, true], status: "左図柄、停止。" });
    });
    after(TIMINGS.rightStop * speed, () => {
      if (!plan) return;
      update({ phase: "right-stop", symbols: [plan.finalSymbols[0], view.symbols[1], plan.finalSymbols[2]], moving: [false, true, false], status: "右図柄、停止。" });
      after(plan.reach ? TIMINGS.reachAnnouncement : TIMINGS.noReachFinish * speed, plan.reach ? announceReach : freezeResult);
    });
  }
  function startGame(hold: Hold) { plan = planForTicket(hold.ticket, view.mode); startPlan(); }
  function startPlan() {
    if (!plan) return;
    centerSlow = false; centerTicks = 0; slowStep = 0;
    update({ gameId: view.gameId + 1, heat: plan.heat, isSeven: false, revived: false, bonusRound: 0,
      bonusHits: 0, bonusRoundsTotal: 0, attackerOpen: false, rushEntry: false,
      moving: [false, false, false], phase: plan.heat === "normal" ? "varying" : "chance",
      status: plan.heat === "hot" ? "激熱保留！勝負の一球！" : "チャンス到来！" });
    if (plan.heat === "normal") beginVariation(); else after(TIMINGS.chance, beginVariation);
  }
  function pay(amount: number) {
    update({ ballsOwned: view.ballsOwned + (view.preview ? 0 : amount), totalPayout: view.totalPayout + (view.preview ? 0 : amount), lastPayout: amount, payoutId: view.payoutId + 1 });
  }
  function registerAttackerHit() {
    if (view.phase !== "bonus" || !view.attackerOpen) return;
    pay(ATTACKER_PAYOUT);
    const hits = view.bonusHits + 1;
    update({ bonusHits: hits, attackerOpen: hits < BONUS_HITS_PER_ROUND });
    if (hits >= BONUS_HITS_PER_ROUND) {
      update({ status: `${view.bonusRound}R 完了！ ${BONUS_HITS_PER_ROUND * ATTACKER_PAYOUT}玉払い出し` });
      const nextRound = view.bonusRound + 1;
      after(TIMINGS.bonusRound, () => beginBonus(nextRound));
    }
  }
  function arrive(ball: Ball) {
    view = { ...view, balls: view.balls.filter((current) => current.id !== ball.id) };
    if (ball.target === "start") {
      pay(START_PAYOUT);
      // A full chucker still pays, but it cannot create a fifth hold.
      if (!plan || view.holds.length < HOLD_CAPACITY) {
        const ticket = createGameTicket(random);
        const hold: Hold = { id: ball.id, ticket, heat: planForTicket(ticket, view.mode).heat };
        view = { ...view, entryId: view.entryId + 1 };
        if (!plan) startGame(hold); else update({ holds: [...view.holds, hold] });
      } else update();
    } else if (ball.target === "prize") pay(PRIZE_PAYOUT);
    else if (ball.target === "attacker") { registerAttackerHit(); update(); }
    else update();
    if (view.firing && !cooldown) launchBall();
  }
  function launchBall() {
    if (!launchAllowed()) return;
    cooldown = true;
    const id = ++nextBallId;
    const flight = createBallFlight({ id, power: view.power, mode: view.phase === "bonus" ? "rush" : view.mode, attackerOpen: view.attackerOpen }, random);
    const ball: Ball = { id, path: (id % 3) as 0 | 1 | 2, enters: flight.target === "start", heat: "normal", power: view.power, target: flight.target, flight };
    const remaining = view.ballsOwned - 1;
    update({ balls: [...view.balls, ball], ballsOwned: remaining, totalLaunched: view.totalLaunched + 1,
      firing: remaining > 0 && view.firing,
      ...(remaining === 0 ? { status: "持ち玉がなくなりました。無料の玉補充で続けられます。" } : view.phase === "idle" ? { status: view.mode === "rush" ? "右打ち！電チューを狙え！" : "左打ち！釘を抜けてスタートを狙え！" } : {}) });
    after(flight.durationMs, () => arrive(ball));
    after(TIMINGS.launchCooldown, () => { cooldown = false; update(); if (view.firing) launchBall(); });
  }
  function setFiring(firing: boolean) {
    if (!alive || (firing && (!getOptions().ready || view.preview || paused() || view.ballsOwned <= 0))) return;
    update({ firing });
    if (firing) launchBall();
  }
  function syncPause(wasPaused: boolean) {
    if (wasPaused === paused()) { update(); return; }
    if (paused()) {
      const now = Date.now();
      for (const timer of timers) {
        if (timer.handle === null) continue;
        clearTimeout(timer.handle); timer.handle = null;
        timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt));
      }
    } else for (const timer of timers) arm(timer);
    update();
    if (!paused() && view.firing && !cooldown) launchBall();
  }
  function onVisibilityChange() { const before = paused(); hidden = document.visibilityState === "hidden"; syncPause(before); }
  function previewJackpot() {
    if (!previewAllowed()) return;
    previewSaved = view;
    plan = { mode: "normal", heat: "hot", win: true, reach: true, superReach: true, revival: false, rushEntry: true, finalSymbols: [7, 7, 7], missSymbols: [7, 6, 7] };
    view = { ...view, preview: true };
    startPlan();
  }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
  return {
    launchBall, push, setFiring, previewJackpot,
    setPower: (power) => { if (Number.isFinite(power)) update({ power: Math.max(0, Math.min(100, power)) }); },
    setPaused: (value) => { const before = paused(); manualPause = value; syncPause(before); },
    refill: () => { if (!view.preview) update({ ballsOwned: view.ballsOwned + INITIAL_BALLS, status: `無料で ${INITIAL_BALLS}玉 補充しました。` }); },
    refresh: () => { update(); if (view.firing && !cooldown) launchBall(); },
    dispose: () => {
      alive = false;
      for (const timer of timers) if (timer.handle !== null) clearTimeout(timer.handle);
      timers.clear();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
