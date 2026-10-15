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
};

export type MarathonState = {
  startedAt: number;
  lastWateredAt: number;
  revision: number;
  totalWaterMl: number;
  lastGiverName: string | null;
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
  multiplier: MarathonMood["multiplier"];
};
export type MarathonSnapshot = Omit<GameSnapshot, "gameId" | "run"> & {
  gameId: typeof MARATHON.gameId;
  run: null;
  serverNow: number;
  state: MarathonState;
  lastWater: MarathonWater | null;
};
export type MarathonWaterRequest = { requestId: string; expectedRevision: number };

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
