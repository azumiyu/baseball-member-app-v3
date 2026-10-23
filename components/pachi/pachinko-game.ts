import type { BallFlight } from "./pachinko-physics";

export const SYMBOL_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type SymbolId = (typeof SYMBOL_IDS)[number];
export const SYMBOL_COUNT = SYMBOL_IDS.length;
export const symbolImagePath = (symbol: number) => `/pachi/${symbol}.png`;
export type Heat = "normal" | "chance" | "hot";
export type GameMode = "normal" | "rush";
export type Phase = "idle" | "chance" | "varying" | "left-stop" | "right-stop" | "reach" | "super-intro" | "pitch" | "swing" | "push" | "freeze" | "miss" | "revival" | "jackpot" | "bonus";
export type Symbols = [SymbolId, SymbolId, SymbolId];

export interface Ball {
  id: number;
  path: 0 | 1 | 2;
  enters: boolean;
  heat: Heat;
  power: number;
  target: BallFlight["target"];
  flight: BallFlight;
}

/** One independent draw per accepted start. A change of mode reuses this draw. */
export interface GameTicket { draw: number; presentationSeed: number }
export interface Hold { id: number; heat: Heat; ticket: GameTicket }

// Local, free virtual balls only. Heat and PUSH never increase the draw odds.
export const JACKPOT_RATE = 1 / 99.9;
export const RUSH_JACKPOT_RATE = 1 / 39.9;
export const RUSH_ENTRY_RATE = 0.5;
export const RUSH_SPINS = 50;
export const INITIAL_BALLS = 2500;
export const HOLD_CAPACITY = 4;
export const MAX_BALLS_IN_FLIGHT = 12;
export const BONUS_ROUNDS = 5;
export const RUSH_BONUS_ROUNDS = 10;
export const BONUS_HITS_PER_ROUND = 10;
export const ATTACKER_PAYOUT = 15;
export const START_PAYOUT = 3;
export const PRIZE_PAYOUT = 5;
export const START_ENTRY_RATE = 0.2;
export const REACH_RATE = 0.08;
export const SUPER_REACH_RATE = 0.2;
export const REVIVAL_RATE = 0.12;
export const CHANCE_UP_RATE = 0.04;
export const HOT_HOLD_RATE = 0.002;
export const HEAT_SETTINGS = {
  normal: { jackpotMultiplier: 1, superReachBonus: 0 },
  chance: { jackpotMultiplier: 1, superReachBonus: 0.2 },
  hot: { jackpotMultiplier: 1, superReachBonus: 0.55 },
} as const;

export const TIMINGS = {
  launchCooldown: 600,
  entryBall: 3000,
  missedBall: 3500,
  reducedBall: 450,
  chance: 650,
  symbolTick: 95,
  slowSymbolTick: 350,
  leftStop: 1300,
  rightStop: 2100,
  reachAnnouncement: 380,
  noReachFinish: 380,
  normalReach: 2600,
  superReachLead: 1300,
  superIntro: 1200,
  pitch: 1000,
  swing: 800,
  pushTimeout: 6500,
  freeze: 600,
  miss: 900,
  revivalMiss: 1500,
  revival: 1400,
  jackpot: 3000,
  sevenJackpot: 4200,
  bonusRound: 800,
  previewHit: 180,
} as const;

export interface GamePlan {
  mode: GameMode;
  heat: Heat;
  win: boolean;
  reach: boolean;
  superReach: boolean;
  revival: boolean;
  rushEntry: boolean;
  finalSymbols: Symbols;
  missSymbols: Symbols;
}

export function randomSymbol(random: () => number = Math.random): SymbolId {
  return (Math.floor(random() * SYMBOL_COUNT) + 1) as SymbolId;
}
export function neighborSymbol(symbol: SymbolId, direction: -1 | 1): SymbolId {
  return (((symbol - 1 + direction + SYMBOL_COUNT) % SYMBOL_COUNT) + 1) as SymbolId;
}
export function chooseHeat(random: () => number = Math.random, win = false): Heat {
  const value = random();
  return win ? (value < 0.6 ? "hot" : value < 0.9 ? "chance" : "normal")
    : value < HOT_HOLD_RATE ? "hot" : value < CHANCE_UP_RATE ? "chance" : "normal";
}
export function jackpotRate(modeOrHeat: GameMode | Heat = "normal"): number {
  return modeOrHeat === "rush" ? RUSH_JACKPOT_RATE : JACKPOT_RATE;
}

/** Select the result first, then correlated presentation. PUSH is just a reveal. */
export function createGamePlan(modeOrHeat: GameMode | Heat = "normal", random: () => number = Math.random): GamePlan {
  const mode: GameMode = modeOrHeat === "rush" ? "rush" : "normal";
  const win = random() < jackpotRate(mode);
  const heat = chooseHeat(random, win);
  const rushEntry = win && (mode === "rush" || random() < RUSH_ENTRY_RATE);
  const reach = win || random() < REACH_RATE;
  const revival = win && random() < REVIVAL_RATE;
  const superReach = reach && (revival || random() < (win ? 0.8 : SUPER_REACH_RATE + HEAT_SETTINGS[heat].superReachBonus));
  let left = randomSymbol(random);
  // 777 always announces RUSH; ordinary symbols can also enter RUSH.
  if (win && !rushEntry && left === 7) left = 6;
  const right = reach ? left : ((((left + Math.floor(random() * (SYMBOL_COUNT - 1))) % SYMBOL_COUNT) + 1) as SymbolId);
  const missedCenter = reach ? neighborSymbol(left, random() < 0.5 ? -1 : 1) : randomSymbol(random);
  return { mode, heat, win, reach, superReach, revival, rushEntry,
    finalSymbols: [left, win ? left : missedCenter, right], missSymbols: [left, missedCenter, right] };
}

export function createGameTicket(random: () => number = Math.random): GameTicket {
  return { draw: random(), presentationSeed: Math.floor(random() * 0x100000000) >>> 0 };
}

/** A queued ticket is evaluated at consumption mode, never redrawn. */
export function planForTicket(ticket: GameTicket, mode: GameMode): GamePlan {
  let seed = ticket.presentationSeed;
  let first = true;
  return createGamePlan(mode, () => {
    if (first) { first = false; return ticket.draw; }
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  });
}
