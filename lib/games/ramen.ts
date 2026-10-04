export const RAMEN = {
  durationMs: 20_000,

  drainPerSecond: 48, // 既存との互換用
  drainRates: [36, 44, 52, 60],
  drainChangeMs: 1_000,
  drainStartPerSecond: 5, // 開始時の減少速度
  drainMaxPerSecond: 20, // 最大減少速度
  drainRampMs: 10_000, // 2秒で最大速度に到達
  drainResetMs: 150, // 150ms以上離すと加速リセット

  perfectMin: 0,
  perfectMax: 2,

  recoverPerSecond: 50,
  perfectRecoverPerSecond: 100,
  gramsPerSecond: 100,
  coughMs: 3_000,
  coughRecovery: 50,
  comboStep: 0.08,
  maxComboBoost: 1.4,
  zoneBoost: 1.5,
  zoneMs: 3_000,
  bowlGrams: 300,
  maxInputs: 512,
} as const;

export type RamenInput = { at: number; held: boolean };
export type RamenReady = { kind: "ramen-ready"; preparedAt: number };
export type RamenResult = {
  kind: "ramen-result";
  grams: number;
  bowls: number;
  maxCombo: number;
  perfects: number;
  coughs: number;
  title: string;
};
export type RamenRunResult = RamenReady | RamenResult;
export type RamenState = {
  elapsedMs: number;
  grams: number;
  lung: number;
  held: boolean;
  coughUntil: number;
  zoneUntil: number;
  combo: number;
  maxCombo: number;
  perfects: number;
  coughs: number;
  bowls: number;
  lastJudgement: "none" | "normal" | "perfect" | "cough";
  judgementAt: number;
  lastBowlAt: number;
  finished: boolean;
  multiplier: number;
  resting: boolean;        // 休憩中かどうか
recoveryBoost: boolean;  // PERFECT回復中かどうか
};

const EPSILON = 1e-8;

export function validateRamenInputs(value: unknown): RamenInput[] {
  if (!Array.isArray(value) || value.length > RAMEN.maxInputs) {
    throw new Error("操作履歴を確認してください。");
  }
  let previousAt = -1;
  let previousHeld = false;
  return Array.from(value, (input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("操作履歴を確認してください。");
    const { at, held } = input as Partial<RamenInput>;
    if (
      typeof at !== "number" ||
      !Number.isInteger(at) ||
      at < 0 ||
      at > RAMEN.durationMs ||
      at <= previousAt ||
      typeof held !== "boolean" ||
      held === previousHeld ||
      (previousAt === -1 && at !== 0)
    ) {
      throw new Error("操作の順番と時刻を確認してください。");
    }
    previousAt = at;
    previousHeld = held;
    return { at, held };
  });
}

export function simulateRamen(
  inputs: readonly RamenInput[],
  untilMs: number = RAMEN.durationMs
): RamenState {

  if (!Number.isFinite(untilMs)) {
    throw new Error("経過時間を確認してください。");
  }

  const history = validateRamenInputs(inputs);

  const until = Math.min(
    RAMEN.durationMs,
    Math.max(0, untilMs)
  );

  const state: RamenState = {
    elapsedMs: 0,
    grams: 0,
    lung: 100,
    held: false,
    resting: false,
    recoveryBoost: false,
    coughUntil: 0,
    zoneUntil: 0,
    combo: 0,
    maxCombo: 0,
    perfects: 0,
    coughs: 0,
    bowls: 0,
    lastJudgement: "none",
    judgementAt: -1,
    lastBowlAt: -1,
    finished: false,
    multiplier: 1,
  };

  let holdMs = 0;
  let restStartedAt = 0;

  // ========================================
  // 長押し時間から肺活量消費を計算
  // ========================================

  const consumedDuringHold = (ms: number): number => {

    const ramp = RAMEN.drainRampMs;
    const rampTime = Math.min(ms, ramp);

    const rampConsumption =
      RAMEN.drainPerSecond * rampTime
      + (
        RAMEN.drainMaxPerSecond
        - RAMEN.drainPerSecond
      ) * rampTime * rampTime / (2 * ramp);

    const maxConsumption =
      RAMEN.drainMaxPerSecond
      * Math.max(0, ms - ramp);

    return (
      rampConsumption + maxConsumption
    ) / 1_000;
  };

  // ========================================
  // すすり倍率
  // ========================================

  const multiplier = () =>
    Math.min(
      RAMEN.maxComboBoost,
      1 + state.combo * RAMEN.comboStep
    ) * (
      state.elapsedMs < state.zoneUntil
        ? RAMEN.zoneBoost
        : 1
    );

  // ========================================
  // 時間経過処理
  // ========================================

  const advance = (target: number) => {

    while (state.elapsedMs < target) {

      // ------------------------------------
      // むせている間
      // ------------------------------------

      if (state.elapsedMs < state.coughUntil) {

        state.elapsedMs = Math.min(
          target,
          state.coughUntil
        );

        if (state.elapsedMs === state.coughUntil) {

          state.lung = RAMEN.coughRecovery;
          state.coughUntil = 0;

          holdMs = 0;
        }

        continue;
      }

      // ====================================
      // 休憩中
      // ====================================

      if (state.resting) {

        const rate = state.recoveryBoost
          ? RAMEN.perfectRecoverPerSecond
          : RAMEN.recoverPerSecond;

        // 100%回復するまでに必要な時間
        const neededMs =
          (100 - state.lung) * 1_000 / rate;

        const fullAt =
          state.elapsedMs + neededMs;

        // まだ100%に到達しない
        if (fullAt > target) {

          const elapsed = target - state.elapsedMs;

          state.lung = Math.min(
            100,
            state.lung + elapsed * rate / 1_000
          );

          state.elapsedMs = target;

          continue;
        }

        // 肺活量100%に到達
        state.lung = 100;

        // 最低150msの休憩も必要
        const readyAt = Math.max(
          fullAt,
          restStartedAt + RAMEN.drainResetMs
        );

        state.elapsedMs = Math.min(
          target,
          readyAt
        );

        // 回復完了！
        if (state.elapsedMs >= readyAt - EPSILON) {

          state.resting = false;
          state.recoveryBoost = false;

          // 次のすすりは再び低速から
          holdMs = 0;
        }

        continue;
      }

      // ------------------------------------
      // 何もしていない状態
      // ------------------------------------

      if (!state.held) {
        state.elapsedMs = target;
        continue;
      }

      // ====================================
      // すすっている間
      // ====================================

      const zoneEnd =
        state.zoneUntil > state.elapsedMs
          ? state.zoneUntil
          : Infinity;

      const stepLimit = Math.min(
        target - state.elapsedMs,
        zoneEnd - state.elapsedMs
      );

      const before = consumedDuringHold(holdMs);

      let step = stepLimit;

      let lungUsed =
        consumedDuringHold(holdMs + step) - before;

      // ------------------------------------
      // 息切れ時刻を求める
      // ------------------------------------

      const willCough =
        lungUsed >= state.lung - EPSILON;

      if (willCough) {

        let low = 0;
        let high = stepLimit;

        for (let i = 0; i < 40; i++) {

          const mid = (low + high) / 2;

          const consumed =
            consumedDuringHold(holdMs + mid) - before;

          if (consumed >= state.lung) {
            high = mid;
          } else {
            low = mid;
          }
        }

        step = high;
        lungUsed = state.lung;
      }

      // ------------------------------------
      // すすった重量
      // ------------------------------------

      const gramsPerMs =
        RAMEN.gramsPerSecond * multiplier() / 1_000;

      const grams =
        state.grams + step * gramsPerMs;

      const bowls = Math.floor(
        (grams + EPSILON) / RAMEN.bowlGrams
      );

      if (bowls > state.bowls) {

        state.lastBowlAt =
          state.elapsedMs
          + (
            bowls * RAMEN.bowlGrams - state.grams
          ) / gramsPerMs;
      }

      state.grams = grams;
      state.bowls = bowls;

      state.lung = willCough
        ? 0
        : Math.max(0, state.lung - lungUsed);

      state.elapsedMs += step;
      holdMs += step;

      // ====================================
      // 息切れ！
      // ====================================

      if (
        willCough
        && state.elapsedMs < RAMEN.durationMs
      ) {

        state.held = false;
        state.resting = true;
        state.recoveryBoost = false;

        restStartedAt = state.elapsedMs;

        state.coughUntil =
          state.elapsedMs + RAMEN.coughMs;

        state.combo = 0;
        state.coughs += 1;

        state.lastJudgement = "cough";
        state.judgementAt = state.elapsedMs;
      }
    }
  };

  // ========================================
  // 操作履歴の処理
  // ========================================

  for (const input of history) {

    if (input.at > until) break;

    advance(input.at);

    if (input.at === RAMEN.durationMs) break;

    // --------------------------------------
    // 長押し開始
    // --------------------------------------

    if (input.held) {

      // 休憩中はすすれない！
      if (state.resting) {
        continue;
      }

      // 肺活量100%でなければ開始不可
      if (state.lung < 100 - EPSILON) {
        continue;
      }

      // むせている間も開始不可
      if (state.elapsedMs < state.coughUntil) {
        continue;
      }

      state.held = true;

      // すすり速度は初期状態から
      holdMs = 0;

      continue;
    }

    // --------------------------------------
    // 指を離した
    // --------------------------------------

    // 実際にすすっていなければ無視
    if (!state.held) {
      continue;
    }

    state.held = false;
    state.resting = true;

    restStartedAt = input.at;

    // ====================================
    // PERFECT判定
    // ====================================

    const perfect =
      state.lung >= RAMEN.perfectMin - EPSILON
      && state.lung <= RAMEN.perfectMax + EPSILON;

    state.lastJudgement =
      perfect ? "perfect" : "normal";

    state.judgementAt = input.at;

    // PERFECTなら高速回復！
    state.recoveryBoost = perfect;

    if (perfect) {

      state.combo += 1;
      state.perfects += 1;

      state.maxCombo = Math.max(
        state.maxCombo,
        state.combo
      );

      // 3コンボごとに根岸ゾーン
      if (state.combo % 3 === 0) {

        state.zoneUntil =
          input.at + RAMEN.zoneMs;
      }

    } else {

      state.combo = 0;
    }
  }

  // ========================================
  // 残り時間を進める
  // ========================================

  advance(until);

  state.finished = until === RAMEN.durationMs;

  if (state.finished) {
    state.held = false;
  }

  state.multiplier = multiplier();

  return state;
}

export function ramenTitle(grams: number): string {
  if (grams >= 2_200) return "伝説のラーメン王・根岸";
  if (grams >= 1_850) return "人間掃除機";
  if (grams >= 1_500) return "すすりの鬼";
  if (grams >= 1_100) return "替え玉職人";
  if (grams >= 300) return "一般ラーメン好き";
  return "まずは一口";
}

export function resolveRamen(
  inputs: readonly RamenInput[],
): RamenResult {
  const state = simulateRamen(inputs, RAMEN.durationMs);
  const grams = Math.floor(state.grams + EPSILON);

  return {
    kind: "ramen-result",
    grams,
    bowls: Math.floor(grams / RAMEN.bowlGrams),
    maxCombo: state.maxCombo,
    perfects: state.perfects,
    coughs: state.coughs,
    title: ramenTitle(grams),
  };
}

export function ramenDrainRate(elapsedMs: number, seed: number): number {
  const slot = Math.floor(elapsedMs / RAMEN.drainChangeMs);

  // 同じシードなら必ず同じ結果
  let x = (Math.trunc(seed) ^ Math.imul(slot + 1, 0x9e3779b1)) | 0;

  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;

  return RAMEN.drainRates[(x >>> 0) % RAMEN.drainRates.length];
}
function getDrainRate(holdMs: number): number {
  const progress = Math.min(1, holdMs / RAMEN.drainRampMs);

  return (
    RAMEN.drainStartPerSecond +
    (RAMEN.drainMaxPerSecond - RAMEN.drainStartPerSecond) * progress
  );
}
