export const MAX_VICTIMS = 10_000;
export const MAX_DAMAGE = 10_000_000_000;
export const MAX_SWING_MS = 4_000;
export const PITCH_DURATION_MS = 2_100;

export type BenchPitch = { distanceCm: number; targetMs: number };
export type BenchReady = { kind: "bench-ready"; pitches: BenchPitch[] };
export type BenchResult = {
  kind: "bench-result";
  pitches: BenchPitch[];
  pitchIndex: number;
  elapsedMs: number;
  errorMs: number;
  timing: number;
  distanceCm: number;
  victims: number;
  hospitalized: number;
  minorInjuries: number;
  damage: number;
  grade: string;
};
export type BenchRunResult = BenchReady | BenchResult;

export function prepareBench(random: () => number): BenchReady {
  const draw = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("乱数を確認してください。");
    return value;
  };
  return { kind: "bench-ready", pitches: [{
    distanceCm: 4 + Math.floor(draw() * 47),
    targetMs: 1_000 + Math.floor(draw() * 451),
  }] };
}

export function resolveBenchSwing(ready: BenchReady, pitchIndex: number, elapsedMs: number): BenchResult {
  if (pitchIndex !== 0
    || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_SWING_MS) {
    throw new Error("スイングの時刻を確認してください。");
  }
  // Saved three-pitch runs can resume using only their first pitch.
  if (ready.kind !== "bench-ready" || ![1, 3].includes(ready.pitches.length) || ready.pitches.some((pitch) =>
    !Number.isInteger(pitch.distanceCm) || pitch.distanceCm < 4 || pitch.distanceCm > 50
    || !Number.isInteger(pitch.targetMs) || pitch.targetMs < 1_000 || pitch.targetMs > 1_450)) {
    throw new Error("投球データを確認してください。");
  }
  const pitch = ready.pitches[pitchIndex];
  const errorMs = elapsedMs - pitch.targetMs;
  const error = Math.abs(errorMs);
  const timingQuality = error <= 3 ? 1 : Math.pow( Math.max(0, 1 - (error - 3) / 180), 2 );
  const courseQuality = (54 - pitch.distanceCm) / 50;
  const impact = timingQuality * courseQuality;
  const victims = Math.min(MAX_VICTIMS, Math.max(0, Math.floor(MAX_VICTIMS * timingQuality * (0.2 + 0.8 * courseQuality))));
  const hospitalized = Math.min(victims, Math.floor(victims * (0.15 + 0.65 * impact)));
  const damage = Math.min(MAX_DAMAGE, Math.max(0, Math.round(MAX_DAMAGE * Math.pow(impact, 1.8) / 1_000) * 1_000));
  const grade = victims === 0 ? "空振り！ベンチは無事！"
    : damage === MAX_DAMAGE ? "完全破壊！伝説の引っ張り！"
    : impact >= 0.75 ? "特大の一撃！三塁ベンチ大崩壊！"
    : impact >= 0.4 ? "痛烈な引っ張り！プルニキの底力を思い知れ！"
    : "引っ張った！ベンチにケガ人発生！";
  return { kind: "bench-result", pitches: [{ ...pitch }], pitchIndex, elapsedMs,
    errorMs, timing: Math.round(timingQuality * 100), distanceCm: pitch.distanceCm,
    victims, hospitalized, minorInjuries: victims - hospitalized, damage, grade };
}
