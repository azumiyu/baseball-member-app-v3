/** Scores are integer hundredths of km/h so the ranking never rounds above 200.00. */
export const MAX_SPEED = 20_000;
export const MAX_PITCHES = 1;
export const MIN_RELEASE_MS = 2_400;
export const MAX_RELEASE_MS = 3_600;
export const MAX_ELAPSED_MS = 10_000;
export const PERFECT_WINDOW_MS = 0.005;

export type FastballResult = {
  /** Integer hundredths of km/h: 19923 means 199.23 km/h. */
  speed: number;
  /** Signed timing error: negative is early, positive is late. */
  errorMs: number;
  elapsedMs: number;
  releaseMs: number;
  grade: string;
};

/** The caller supplies the random source; no browser/storage side effects here. */
export function randomRelease(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("乱数は0以上1未満である必要があります。");
  }
  return MIN_RELEASE_MS + (MAX_RELEASE_MS - MIN_RELEASE_MS) * value;
}

function speedGrade(speed: number): string {
  if (speed === MAX_SPEED) return "PERFECT！";
  if (speed >= 19_900) return "超剛速球！";
  if (speed >= 19_000) return "剛速球！";
  if (speed >= 16_000) return "ナイスピッチ！";
  if (speed >= 10_000) return "ストライク！";
  if (speed > 0) return "山なりボール";
  return "暴投！";
}

/**
 * Score an actual measured input time, without adding simulated timing error.
 * A 1 ms miss yields 199.23 km/h; about 150 ms yields 80 km/h.
 * Only the tiny perfect window can score 200.00 km/h. Outside it, even a
 * sub-hundredth display rounding difference must stay at or below 199.99.
 */
export function resolvePitch(elapsedMs: number, releaseMs: number): FastballResult {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_ELAPSED_MS) {
    throw new Error("投球の経過時間を確認してください。");
  }
  if (!Number.isFinite(releaseMs) || releaseMs < MIN_RELEASE_MS || releaseMs > MAX_RELEASE_MS) {
    throw new Error("投球のリリース時刻を確認してください。");
  }

  const errorMs = elapsedMs - releaseMs;
  const absoluteError = Math.abs(errorMs);
  const speed = absoluteError <= PERFECT_WINDOW_MS
    ? MAX_SPEED
    : Math.max(0, Math.min(MAX_SPEED - 1, Math.floor(MAX_SPEED - 77 * Math.pow(absoluteError, 1.008))));

  return { speed, errorMs, elapsedMs, releaseMs, grade: speedGrade(speed) };
}
