export const NANAIRO = {
  gameId: "goto-nanairo", batters: 5, maxReleaseMs: 4_000,
  rareChance: 0.02, rareBonus: 1_000, abeBonus: 1_500, limitBreakChance: 0.15, limitBreakValue: 10,
  perfectMs: 10, goodMs: 40, goodPenalty: 5, missPenalty: 35,
  perfectBoost: 0.03, perfectStrikeoutBonus: 500, courseBonus: 400,
  kitazawaWeight: 0.8, kitazawaBonus: 400, strongPerfectWhiff: 0.40, strongPerfectHit: 0.20, ikeharaPerfectWhiff: 0.20, ikeharaPerfectHit: 0.10,
  ultimateResistanceWhiff: 0.40, ultimateResistanceHit: 0.20,
} as const;

export const NANAIRO_PITCHES = [
  { id: "normal", multiplier: 1.0, name: "通常シンカー", weight: 40, misthrow: 14, whiff: 45, description: "斜め下に沈む", durationMs: 1_450, color: "#6fdcca", sinker: true },
  { id: "fast", multiplier: 1.0, name: "高速シンカー", weight: 20, misthrow: 18, whiff: 55, description: "高速で鋭く落ちる", durationMs: 950, color: "#77bfff", sinker: true },
  { id: "drop", multiplier: 1.0, name: "急降下シンカー", weight: 12, misthrow: 22, whiff: 60, description: "打者の手前で垂直落下", durationMs: 1_400, color: "#b29bff", sinker: true },
  { id: "side", multiplier: 1.0, name: "横滑りシンカー", weight: 12, misthrow: 20, whiff: 55, description: "横に大きく曲がって沈む", durationMs: 1_500, color: "#ffd179", sinker: true },
  { id: "zigzag", multiplier: 1.2, name: "ジグザグシンカー", weight: 8, misthrow: 27, whiff: 68, description: "左右に何度も変化", durationMs: 1_650, color: "#ffb577", sinker: true },
  { id: "vanish", multiplier: 1.2, name: "消えるシンカー", weight: 5, misthrow: 32, whiff: 75, description: "一瞬消えて再出現", durationMs: 1_550, color: "#d5e5f5", sinker: true },
  { id: "ultimate", multiplier: 1.5, name: "七色の究極シンカー", weight: 3, misthrow: 38, whiff: 85, description: "虹色に光り、異常な軌道で変化", durationMs: 1_850, color: "#ff8fcd", sinker: true },
] as const;
// Kept only to display saved results from before the seven-sinker rules.
const LEGACY_PITCHES = [
  { id: "straight", multiplier: 1.0, name: "ストレート", weight: 12, misthrow: 13, whiff: 30, description: "真っすぐ伸びる", durationMs: 900, color: "#f0ead9", sinker: false },
  { id: "slider", multiplier: 1.0, name: "スライダー", weight: 5, misthrow: 18, whiff: 50, description: "横方向に曲がる", durationMs: 1_250, color: "#a6d68c", sinker: false },
  { id: "curve", multiplier: 1.0, name: "カーブ", weight: 3, misthrow: 17, whiff: 45, description: "山なりに落ちる", durationMs: 1_900, color: "#f2adbf", sinker: false },
] as const;
export type NanairoPitchId = typeof NANAIRO_PITCHES[number]["id"] | typeof LEGACY_PITCHES[number]["id"];

export const NANAIRO_BATTERS = [
  { id: "yamaki", name: "八巻", power: 4, meet: 3, description: "究極シンカーにめっぽう強い。" },
  { id: "kan", name: "菅", power: 2, meet: 2, description: "15％でミート10パワー10に限界突破。" },
  { id: "kawanabe", name: "川鍋", power: 3, meet: 4, description: "究極シンカーにめっぽう強い。" },
  { id: "ikehara", name: "池原", power: 6, meet: 6, description: "PERFECTに弱い。" },
  { id: "misawa", name: "三澤", power: 5, meet: 3, description: "低めは特に危険。高めで勝負！" },
  { id: "kobayashi", name: "小林", power: 2, meet: 2, description: "15％でミート10パワー10に限界突破。" },
  { id: "ishihata", name: "石畑", power: 1, meet: 1, description: "全コースが苦手。チャンスキャラ。出現率激低！" },
  { id: "chiaki", name: "千明", power: 9, meet: 3, description: "PERFECTにめっぽう弱い。" },
  { id: "abe", name: "阿部", power: 1, meet: 1, description: "全コースが苦手。チャンスキャラ。出現率激低！" },
  { id: "kitazawa", name: "北澤", power: 8, meet: 8, description: "PERFECTにめっぽう弱い。出現率低！三振を取ると追加＋400点。" },
] as const;
export type NanairoBatterId = typeof NANAIRO_BATTERS[number]["id"];
export type NanairoPoint = { x: number; y: number };
export type NanairoJudgement = "PERFECT" | "GOOD" | "MISS";
export type NanairoOutcome = "swing-k" | "looking-k" | "out" | "single" | "double" | "triple" | "homer" | "walk";
export const NANAIRO_OUTCOME_LABELS: Record<NanairoOutcome, string> = {
  "swing-k": "空振り三振！", "looking-k": "見逃し三振！", out: "凡打", single: "ヒット", double: "二塁打",
  triple: "三塁打", homer: "ホームラン…！", walk: "フォアボール…",
};
export type NanairoReady = { batterId: NanairoBatterId; pitchId: NanairoPitchId; direction: -1 | 1; releaseMs: number };
export type NanairoPitchResult = NanairoReady & {
  target: NanairoPoint; landing: NanairoPoint; errorMs: number; judgement: NanairoJudgement;
  misthrowRate: number; misthrow: boolean; wild: boolean; swung: boolean; whiffRate: number;
  power: number; meet: number; limitBreak: "power" | "meet" | "both" | null;
  outcome: NanairoOutcome; basePoints: number; comboBonus: number; magicBonus: number; luckyBonus: number; courseBonus: number;
  // Older saved results predate the PERFECT strikeout bonus.
  perfectBonus?: number;
  // Older saved results have no multiplier and retain their recorded points.
  multiplier?: number; points: number; streak: number; total: number; outOfPark: boolean;
};
export type NanairoState = {
  kind: "nanairo"; lineup: NanairoBatterId[]; ready: NanairoReady | null;
  history: NanairoPitchResult[]; total: number; streak: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function draw(random: () => number) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("乱数を確認してください。");
  return value;
}
export function nanairoPitch(id: NanairoPitchId) {
  const pitch = [...NANAIRO_PITCHES, ...LEGACY_PITCHES].find((entry) => entry.id === id);
  if (!pitch) throw new Error("球種を確認してください。");
  return pitch;
}
export function nanairoBatter(id: NanairoBatterId) {
  const batter = NANAIRO_BATTERS.find((entry) => entry.id === id);
  if (!batter) throw new Error("打者を確認してください。");
  return batter;
}
export function drawNanairoPitch(random: () => number): NanairoPitchId {
  const roll = draw(random) * 100;
  let threshold = 0;
  for (const pitch of NANAIRO_PITCHES) {
    threshold += pitch.weight;
    if (roll < threshold) return pitch.id;
  }
  return "ultimate";
}
function prepare(batterId: NanairoBatterId, random: () => number): NanairoReady {
  return { batterId, pitchId: drawNanairoPitch(random), direction: draw(random) < 0.5 ? -1 : 1,
    releaseMs: 1_500 + Math.floor(draw(random) * 801) };
}
export function isNanairoLuckyBatter(id: NanairoBatterId) {
  return id === "ishihata" || id === "abe";
}
export function nanairoLuckyBonus(id: NanairoBatterId) {
  // Batter-specific out bonuses share the existing saved luckyBonus field.
  return id === "abe" ? NANAIRO.abeBonus : id === "ishihata" ? NANAIRO.rareBonus : id === "kitazawa" ? NANAIRO.kitazawaBonus : 0;
}
export function createNanairo(random: () => number): NanairoState {
  // Independent 2% draws, each confined to its own slot. Ordinary batters do not repeat.
  const ishihata = draw(random) < NANAIRO.rareChance;
  const abe = draw(random) < NANAIRO.rareChance;
  const pool = NANAIRO_BATTERS.filter(batter => !isNanairoLuckyBatter(batter.id)).map(batter => ({
    id: batter.id, weight: batter.id === "kitazawa" ? NANAIRO.kitazawaWeight : 1,
  }));
  const lineup: NanairoBatterId[] = [];
  for (let slot = 0; slot < NANAIRO.batters; slot++) {
    let roll = draw(random) * pool.reduce((sum, batter) => sum + batter.weight, 0);
    let index = pool.length - 1;
    for (let candidate = 0; candidate < pool.length; candidate++) {
      roll -= pool[candidate].weight;
      if (roll < 0) { index = candidate; break; }
    }
    lineup.push(pool.splice(index, 1)[0].id);
  }
  if (abe) lineup[4] = "abe";
  if (ishihata) lineup[3] = "ishihata";
  return { kind: "nanairo", lineup, ready: prepare(lineup[0], random), history: [], total: 0, streak: 0 };
}
export function validateNanairoInput(target: unknown, elapsedMs: unknown): { target: NanairoPoint; elapsedMs: number } {
  if (!target || typeof target !== "object" || Array.isArray(target)) throw new Error("投げるコースを選んでください。");
  const { x, y } = target as Partial<NanairoPoint>;
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 100
    || typeof y !== "number" || !Number.isFinite(y) || y < 0 || y > 100
    || typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > NANAIRO.maxReleaseMs) {
    throw new Error("コースとリリース時刻を確認してください。");
  }
  return { target: { x, y }, elapsedMs };
}
export function nanairoRelease(errorMs: number, pitchId: NanairoPitchId) {
  if (!Number.isFinite(errorMs)) throw new Error("リリース時刻を確認してください。");
  const error = Math.abs(errorMs);
  const judgement: NanairoJudgement = error <= NANAIRO.perfectMs ? "PERFECT" : error <= NANAIRO.goodMs ? "GOOD" : "MISS";
  return { judgement, misthrowRate: Math.min(100, nanairoPitch(pitchId).misthrow + (judgement === "GOOD" ? NANAIRO.goodPenalty : judgement === "MISS" ? NANAIRO.missPenalty : 0)) };
}
export function nanairoInZone(point: NanairoPoint) {
  return point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100;
}
/** Shared by the server's matchup calculation and the course-color guide.
 * Affinity is from the batter's perspective: strong is dangerous for Goto. */
export function nanairoCourse(batterId: NanairoBatterId, point: NanairoPoint) {
  if (!nanairoInZone(point)) return { whiffBonus: 0.12, hitBonus: -0.10, affinity: "neutral" as const };
  // Match the displayed course numbers: 1–3 on top, 4–6 in the middle, 7–9 below.
  const column = Math.min(2, Math.floor(point.x * 3 / 100));
  const row = Math.min(2, Math.floor(point.y * 3 / 100));
  const course = row * 3 + column + 1;
  let affinity: "weak" | "strong" | "neutral";
  switch (batterId) {
    case "kitazawa": affinity = column <= 1 ? "strong" : "weak"; break;
    case "chiaki": case "ikehara": affinity = course <= 6 ? "strong" : "weak"; break;
    case "yamaki": affinity = column >= 1 && row <= 1 ? "strong" : "weak"; break;
    case "kawanabe": affinity = column <= 1 && row <= 1 ? "strong" : "weak"; break;
    case "kan": case "kobayashi": affinity = row === 1 ? "strong" : "weak"; break;
    case "misawa": affinity = row === 2 ? "strong" : "weak"; break;
    case "ishihata": case "abe": affinity = "weak"; break;
  }
  const extra = batterId === "misawa" && affinity === "strong" ? 0.05 : 0;
  return { whiffBonus: affinity === "strong" ? -0.16 - extra : affinity === "weak" ? 0.16 : 0,
    hitBonus: affinity === "strong" ? 0.20 + extra : affinity === "weak" ? -0.12 : 0, affinity };
}
function isStrongAgainstUltimate(pitchId: NanairoPitchId, batterId: NanairoBatterId) {
  return pitchId === "ultimate" && (batterId === "yamaki" || batterId === "kawanabe");
}
export function nanairoWhiffRate(pitchId: NanairoPitchId, batterId: NanairoBatterId, landing: NanairoPoint, meet = nanairoBatter(batterId).meet as number) {
  const pitch = nanairoPitch(pitchId);
  if (isNanairoLuckyBatter(batterId)) return 0.98;
  const rate = pitch.whiff / 100 - (meet - 3) * 0.09 + nanairoCourse(batterId, landing).whiffBonus
    - (isStrongAgainstUltimate(pitchId, batterId) ? NANAIRO.ultimateResistanceWhiff : 0);
  return clamp(rate, 0.03, 0.98);
}
export function nanairoPoints(outcome: NanairoOutcome, pitchId: NanairoPitchId, batterId: NanairoBatterId, previousStreak: number, landing?: NanairoPoint, judgement?: NanairoJudgement) {
  const strikeout = outcome === "swing-k" || outcome === "looking-k";
  const streak = strikeout ? previousStreak + 1 : 0;
  const basePoints = outcome === "swing-k" ? 1_000 : outcome === "looking-k" ? 800
    : outcome === "homer" ? -2_000 : outcome === "triple" ? -1_500 : outcome === "double" ? -1_000
      : outcome === "walk" ? -500 : outcome === "out" ? 500 : -500;
  const comboBonus = streak === 2 ? 500 : streak >= 3 ? 1_000 : 0;
  // Retain the field for saved-result compatibility. New scores have no magic bonus.
  const magicBonus = 0;
  const luckyBonus = strikeout || (outcome === "out" && batterId !== "kitazawa") ? nanairoLuckyBonus(batterId) : 0;
  const courseBonus = strikeout && landing && nanairoInZone(landing) && nanairoCourse(batterId, landing).affinity === "strong" ? NANAIRO.courseBonus : 0;
  const perfectBonus = strikeout && judgement === "PERFECT" ? NANAIRO.perfectStrikeoutBonus : 0;
  const multiplier = nanairoPitch(pitchId).multiplier;
  const points = Math.round((basePoints + comboBonus + luckyBonus + courseBonus + perfectBonus) * multiplier);
  return { basePoints, comboBonus, magicBonus, luckyBonus, courseBonus, perfectBonus, multiplier, streak, points };
}

/** Old prepared pitches become normal sinkers; saved result history stays intact. */
export function normalizeNanairo(state: NanairoState): NanairoState {
  if (!state.ready || !LEGACY_PITCHES.some(pitch => pitch.id === state.ready?.pitchId)) return state;
  return { ...state, ready: { ...state.ready, pitchId: "normal" } };
}

/** Server-owned randomness and totals. The client only submits its aim and measured input time. */
export function playNanairo(state: NanairoState, target: NanairoPoint, elapsedMs: number, random: () => number): NanairoState {
  state = normalizeNanairo(state);
  const input = validateNanairoInput(target, elapsedMs);
  const ready = state.ready;
  if (state.kind !== "nanairo" || !ready || state.history.length >= NANAIRO.batters
    || state.lineup.length !== NANAIRO.batters || state.lineup[state.history.length] !== ready.batterId
    || !Number.isInteger(ready.releaseMs) || ready.releaseMs < 1_500 || ready.releaseMs > 2_300) {
    throw new Error("ゲームの投球状態を確認してください。");
  }
  const batter = nanairoBatter(ready.batterId);
  const errorMs = input.elapsedMs - ready.releaseMs;
  const release = nanairoRelease(errorMs, ready.pitchId);
  const misthrow = draw(random) * 100 < release.misthrowRate;
  // Successful pitches travel to the chosen final course. A misthrow can be a
  // hittable strike, a chaseable ball, or a wild pitch; it is not an automatic walk.
  const landing = { ...input.target };
  if (misthrow) {
    const angle = draw(random) * Math.PI * 2;
    const distance = 35 + draw(random) * 95;
    landing.x += Math.cos(angle) * distance;
    landing.y += Math.sin(angle) * distance;
  }
  const wild = landing.x < -50 || landing.x > 150 || landing.y < -50 || landing.y > 150;
  let power: number = batter.power;
  let meet: number = batter.meet;
  let limitBreak: NanairoPitchResult["limitBreak"] = null;
  if ((batter.id === "kan" || batter.id === "kobayashi") && draw(random) < NANAIRO.limitBreakChance) {
    limitBreak = "both";
    meet = NANAIRO.limitBreakValue;
    power = NANAIRO.limitBreakValue;
  }
  const inZone = nanairoInZone(landing);
  const edge = Math.min(landing.x, 100 - landing.x, landing.y, 100 - landing.y);
  const center = landing.x >= 35 && landing.x <= 65 && landing.y >= 35 && landing.y <= 65;
  const outside = Math.max(0, -landing.x, landing.x - 100, -landing.y, landing.y - 100);
  const swingRate = inZone ? (isNanairoLuckyBatter(batter.id) ? 0.88 : 0.78 + (center ? 0.12 : 0) - (edge < 18 ? 0.12 : 0))
    : clamp(0.42 - outside / 120, 0.02, 0.42);
  let swung = false;
  const luckyControl = isNanairoLuckyBatter(batter.id) && release.judgement !== "MISS" && !misthrow;
  if (!luckyControl) swung = draw(random) < swingRate;
  const perfectBoost = release.judgement === "PERFECT" ? NANAIRO.perfectBoost : 0;
  const strongPerfect = (batter.id === "chiaki" || batter.id === "kitazawa") && release.judgement === "PERFECT";
  const ikeharaPerfect = batter.id === "ikehara" && release.judgement === "PERFECT";
  const ultimateResistance = isStrongAgainstUltimate(ready.pitchId, batter.id);
  const whiffRate = clamp(nanairoWhiffRate(ready.pitchId, ready.batterId, landing, meet) + perfectBoost + (strongPerfect ? NANAIRO.strongPerfectWhiff : ikeharaPerfect ? NANAIRO.ikeharaPerfectWhiff : 0), 0.03, 0.98);
  let outcome: NanairoOutcome;
  let outOfPark = false;
  if (luckyControl) {
    if (draw(random) >= 0.99) {
      outcome = "homer";
      outOfPark = true;
      swung = true;
    } else {
      const outRoll = draw(random);
      outcome = outRoll < 0.70 ? "swing-k" : outRoll < 0.90 ? "looking-k" : "out";
      swung = outcome !== "looking-k";
    }
  } else if (!swung) outcome = inZone ? "looking-k" : "walk";
  else if (draw(random) < whiffRate) outcome = "swing-k";
  else {
    const hitRate = clamp(0.40 + (meet - 3) * 0.07 + nanairoCourse(batter.id, landing).hitBonus
      + (misthrow ? 0.10 : 0) - perfectBoost - (strongPerfect ? NANAIRO.strongPerfectHit : ikeharaPerfect ? NANAIRO.ikeharaPerfectHit : 0)
      + (ultimateResistance ? NANAIRO.ultimateResistanceHit : 0), 0.12, 0.97);
    if (draw(random) >= hitRate) outcome = "out";
    else {
      const homerRate = clamp(0.02 + power * power * 0.006 + (center ? 0.12 : 0) + (misthrow ? 0.08 : 0), 0.02, 0.75);
      const roll = draw(random);
      const tripleRate = 0.02 + power * 0.004;
      const doubleRate = 0.15 + power * 0.03;
      outcome = roll < homerRate ? "homer" : roll < homerRate + (1 - homerRate) * tripleRate ? "triple"
        : roll < homerRate + (1 - homerRate) * (tripleRate + doubleRate) ? "double" : "single";
    }
  }
  const score = nanairoPoints(outcome, ready.pitchId, ready.batterId, state.streak, landing, release.judgement);
  const total = state.total + score.points;
  const result: NanairoPitchResult = { ...ready, ...release, ...score, target: input.target, landing, errorMs,
    misthrow, wild, swung, whiffRate, power, meet, limitBreak, outcome, total, outOfPark };
  const history = [...state.history, result];
  return { ...state, history, total, streak: score.streak,
    ready: history.length < NANAIRO.batters ? prepare(state.lineup[history.length], random) : null };
}

/** Presentation coordinates in the same 0–100 course space. All paths end at
 * the authoritative landing point, including wild pitches. No scoring runs here. */
export function nanairoTrajectory(pitchId: NanairoPitchId, landing: NanairoPoint, direction: -1 | 1, progress: number): NanairoPoint {
  const t = clamp(progress, 0, 1);
  const start = { x: 50, y: -90 };
  let x = start.x + (landing.x - start.x) * t;
  let y = start.y + (landing.y - start.y) * t;
  const arc = Math.sin(Math.PI * t);
  switch (pitchId) {
    case "normal": x -= direction * 24 * arc; y -= 28 * arc; break;
    case "fast": x -= direction * 17 * arc; y -= 20 * arc; break;
    case "drop": y = start.y + (landing.y - start.y) * t ** 3.5; break;
    case "side": x -= direction * 65 * arc; y -= 18 * arc; break;
    case "zigzag": x += direction * 30 * Math.sin(t * Math.PI * 6) * arc; y -= 24 * arc; break;
    case "vanish": x -= direction * 30 * arc; y -= 32 * arc; break;
    case "ultimate": x += direction * 48 * Math.sin(t * Math.PI * 4) * arc; y -= 60 * arc; break;
    case "slider": x -= direction * 48 * arc; break;
    case "curve": y -= 65 * arc; break;
    case "straight": break;
  }
  return { x, y };
}

export function nanairoOutcomeLabel(result: NanairoPitchResult) {
  return result.outOfPark ? "場外ホームラン…！" : NANAIRO_OUTCOME_LABELS[result.outcome];
}
