import type { GameSnapshot } from "./api-types";

/** Distance, thirst and occasional moods are calculated from timestamps, so
 * the shared runner never needs a timer, scheduled job, or background write. */
export const MARATHON = {
  gameId: "kobayashi-marathon" as const,
  speedMetersPerSecond: 5,
  minWaterIntervalMs: 10_000,
  initialThirstMs: 300_000,
  eventSlotMs: 180_000,
  eventDurationMs: 60_000,
  japanUtcOffsetMs: 9 * 60 * 60 * 1_000,
  dayMs: 24 * 60 * 60 * 1_000,
  restStartMinuteJst: 2 * 60,
  restDurationMs: 4 * 60 * 60 * 1_000 + 48 * 60 * 1_000,
  dailyWaterLimit: 10,
  dailyStealLimit: 2,
  stealFeePercent: 10,
  stealMinimumScoreMl: 10,
  stealPercentWeights: [
    { percent: 5, weight: 50 },
    { percent: 10, weight: 30 },
    { percent: 15, weight: 15 },
    { percent: 20, weight: 5 },
  ],
  gachaResultDisplayMs: 5_000,
};

export type MarathonState = {
  startedAt: number;
  lastWateredAt: number;
  revision: number;
  totalWaterMl: number;
  lastGiverName: string | null;
  exclusivePlayerId: string | null;
  exclusivePlayerName: string | null;
  exclusiveUntil: number;
};
export type MarathonMoodKind = "normal" | "parched" | "runners-high";
export type MarathonMood = {
  kind: MarathonMoodKind;
  label: string;
  multiplier: 1 | 2 | 0.5;
  endsAt: number;
};
export type MarathonWater = {
  requestId: string;
  amountMl: number;
  wateredAt: number;
  mood: MarathonMoodKind;
  multiplier: number;
  moodMultiplier: MarathonMood["multiplier"];
  gacha: MarathonGachaKind;
  gachaLabel: string;
  gachaMultiplier: number;
  stolenFromName: string | null;
};
export type MarathonSteal = {
  requestId: string;
  stolenAt: number;
  consumedMl: number;
  stolenMl: number;
  percent: number;
  targetPlayerId: string;
  targetName: string;
};
export type MarathonStealNotification = {
  version: number;
  count: number;
  stolenMl: number;
  lastGiverName: string;
};
export type MarathonSnapshot = Omit<GameSnapshot, "gameId" | "run"> & {
  gameId: typeof MARATHON.gameId;
  run: null;
  serverNow: number;
  state: MarathonState;
  dailyWaterCount: number;
  lastWater: MarathonWater | null;
  dailyStealCount: number;
  stealTargetCount: number;
  lastSteal: MarathonSteal | null;
  pendingStealNotification: MarathonStealNotification | null;
};
export type MarathonWaterRequest = { requestId: string; expectedRevision: number };
export type MarathonStealRequest = { requestId: string; expectedRevision: number };

export type MarathonGachaKind = "exclusive" | "triple" | "half" | "double" | "steal" | "normal";
export type MarathonGacha = { kind: MarathonGachaKind; label: string; multiplier: number };

export function marathonJapanDate(now: number): string {
  return new Date(now + MARATHON.japanUtcOffsetMs).toISOString().slice(0, 10);
}

export function marathonJapanDayEnd(now: number): number {
  return (Math.floor((now + MARATHON.japanUtcOffsetMs) / MARATHON.dayMs) + 1) * MARATHON.dayMs
    - MARATHON.japanUtcOffsetMs;
}

export function marathonNoWaterWindow(now: number) {
  const japanDayStart = Math.floor((now + MARATHON.japanUtcOffsetMs) / MARATHON.dayMs)
    * MARATHON.dayMs - MARATHON.japanUtcOffsetMs;
  const startsAt = japanDayStart + MARATHON.restStartMinuteJst * 60_000;
  const endsAt = startsAt + MARATHON.restDurationMs;
  const isResting = now >= startsAt && now < endsAt;
  return {
    isResting,
    startsAt: isResting || now < startsAt ? startsAt : startsAt + MARATHON.dayMs,
    endsAt: isResting ? endsAt : startsAt + MARATHON.restDurationMs,
    nextWaterAt: isResting ? endsAt : now,
  };
}

/** Select one server-side result from a 0–99 roll; weights total exactly 100. */
export function marathonGachaForRoll(roll: number): MarathonGacha {
  if (roll < 1) return { kind: "exclusive", label: "今日1日はあなたしか給水できません！", multiplier: 1 };
  if (roll < 11) return { kind: "triple", label: "給水量3倍！", multiplier: 3 };
  if (roll < 21) return { kind: "half", label: "給水量0.5倍", multiplier: 0.5 };
  if (roll < 41) return { kind: "double", label: "給水量2倍！", multiplier: 2 };
  if (roll < 46) return { kind: "steal", label: "ランキング1位から給水量の10%をもらった！", multiplier: 1 };
  return { kind: "normal", label: "通常給水", multiplier: 1 };
}

export function rollMarathonGacha(): MarathonGacha {
  const limit = Math.floor(0x1_0000_0000 / 100) * 100;
  let value = 0;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  } while (value >= limit);
  return marathonGachaForRoll(value % 100);
}

export function marathonDistanceKm(state: Pick<MarathonState, "startedAt">, now: number): number {
  return Math.max(0, now - state.startedAt) / 1_000 * MARATHON.speedMetersPerSecond / 1_000;
}

export function marathonMood(state: Pick<MarathonState, "startedAt">, now: number): MarathonMood {
  const elapsed = Math.max(0, now - state.startedAt);
  const slot = Math.floor(elapsed / MARATHON.eventSlotMs);
  const slotStart = state.startedAt + slot * MARATHON.eventSlotMs;
  // A stable integer hash gives every visitor the same event, including after
  // refreshing or reopening the game. Only the first minute can be special.
  let hash = (Math.floor(state.startedAt / 1_000) ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  hash = (hash ^ (hash >>> 13)) >>> 0;
  const event = hash % 6;
  if (elapsed % MARATHON.eventSlotMs < MARATHON.eventDurationMs) {
    const endsAt = slotStart + MARATHON.eventDurationMs;
    if (event === 0) return { kind: "parched", label: "ちょうのどかわいた！！", multiplier: 2, endsAt };
    if (event === 1) return { kind: "runners-high", label: "ランナーズハイ中！！", multiplier: 0.5, endsAt };
  }
  return { kind: "normal", label: "今日も走り続ける！", multiplier: 1, endsAt: slotStart + MARATHON.eventSlotMs };
}

export function marathonAvailableWaterMl(state: Pick<MarathonState, "startedAt" | "lastWateredAt">, now: number): number {
  const elapsedSeconds = Math.max(0, now - state.lastWateredAt) / 1_000;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(elapsedSeconds * marathonMood(state, now).multiplier));
}

export function marathonWaitMs(state: Pick<MarathonState, "lastWateredAt">, now: number): number {
  return Math.max(0, state.lastWateredAt + MARATHON.minWaterIntervalMs - now);
}
