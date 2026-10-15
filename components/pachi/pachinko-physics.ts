/** The cabinet and the simulator share one coordinate system and one set of nails. */
export const BOARD_WIDTH = 600;
export const BOARD_HEIGHT = 620;
export const BALL_RADIUS = 5;
export const RAIL_OUTER_PATH = "M575 610 Q603 230 555 92 Q497 8 292 22 Q26 3 24 172 L24 491 Q24 586 185 598";
export const RAIL_INNER_PATH = "M557 610 Q588 233 538 105 Q487 32 292 44 Q49 25 45 173";
export interface BallPoint { x: number; y: number }
export interface BoardPin extends BallPoint { r: number }
export type BallTarget = "start" | "prize" | "attacker" | "out";
export interface BallFlight {
  /** Equal time intervals, rather than equal distances: a ball slows at the crest. */
  points: BallPoint[];
  durationMs: number;
  target: BallTarget;
  lane: "left" | "right";
  bounces: number;
}
export interface BallLaunch { id: number; power: number; mode: string; attackerOpen: boolean }
export const BALL_TARGETS: Readonly<Record<BallTarget, BallPoint>> = {
  start: { x: 300, y: 510 },
  prize: { x: 150, y: 565 },
  attacker: { x: 425, y: 565 },
  out: { x: 300, y: 612 },
};
export const BOARD_PINS: readonly BoardPin[] = [
  ...Array.from({ length: 7 }, (_, i) => ({ x: 71 + i * 76, y: 76 + i % 2 * 13, r: 2.7 })),
  ...Array.from({ length: 12 }, (_, i) => ({ x: i % 2 ? 562 : 38, y: 147 + Math.floor(i / 2) * 43, r: 2.7 })),
  ...Array.from({ length: 10 }, (_, i) => ({ x: i % 2 ? 531 : 69, y: 167 + Math.floor(i / 2) * 43, r: 2.7 })),
  ...Array.from({ length: 9 }, (_, i) => ({ x: 75 + i * 53, y: 418, r: 2.7 })),
  ...Array.from({ length: 9 }, (_, i) => ({ x: 101 + i * 53, y: 452, r: 2.7 })),
  ...[72, 125, 178, 231, 369, 422, 475, 528].map(x => ({ x, y: 481, r: 2.7 })),
  ...[84, 136, 188, 240, 352, 405, 457, 509].map(x => ({ x, y: 535, r: 2.7 })),
  ...[80, 219, 274, 326, 363, 500].map(x => ({ x, y: 566, r: 2.7 })),
  { x: 266, y: 494, r: 2.7 }, { x: 334, y: 494, r: 2.7 },
  { x: 285, y: 523, r: 2.7 }, { x: 315, y: 523, r: 2.7 },
];

const TAU = Math.PI * 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const distance = (a: BallPoint, b: BallPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: BallPoint, b: BallPoint, t: number): BallPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Useful to both deterministic fixtures and the canvas' pin-contact glints. */
export function distanceToBallSegment(pin: BallPoint, a: BallPoint, b: BallPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? clamp(((pin.x - a.x) * dx + (pin.y - a.y) * dy) / denominator, 0, 1) : 0;
  return distance(pin, lerp(a, b, t));
}

function cubic(a: BallPoint, b: BallPoint, c: BallPoint, d: BallPoint, count: number): BallPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    const u = 1 - t;
    return { x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y };
  });
}

/**
 * Short tangent contact around a circular nail. The path is planned once when
 * fired, so neither a render nor a change in sound/motion settings redraws it.
 * Clearance includes the *ball's* radius, not just its centre.
 */
function clearSegment(a: BallPoint, b: BallPoint, handedness: number, depth = 0): BallPoint[] {
  let first: BoardPin | undefined;
  let firstDistance = Infinity;
  for (const pin of BOARD_PINS) {
    const reach = pin.r + BALL_RADIUS + .55;
    if (pin.x < Math.min(a.x, b.x) - reach || pin.x > Math.max(a.x, b.x) + reach || pin.y < Math.min(a.y, b.y) - reach || pin.y > Math.max(a.y, b.y) + reach) continue;
    if (distanceToBallSegment(pin, a, b) >= pin.r + BALL_RADIUS + 0.55) continue;
    const d = distance(a, pin);
    if (d < firstDistance) { first = pin; firstDistance = d; }
  }
  if (!first || depth > 12) return [b];
  const pin = first;
  const radius = pin.r + BALL_RADIUS + 1.7;
  const angleA = Math.atan2(a.y - pin.y, a.x - pin.x);
  const angleB = Math.atan2(b.y - pin.y, b.x - pin.x);
  const alphaA = Math.acos(clamp(radius / distance(a, pin), -1, 1));
  const alphaB = Math.acos(clamp(radius / distance(b, pin), -1, 1));
  const alternatives = [-1, 1].map(direction => {
    const start = angleA + direction * alphaA;
    const end = angleB - direction * alphaB;
    const arc = ((end - start) * direction % TAU + TAU) % TAU;
    return { direction, start, arc, score: arc + (direction === handedness ? 0 : 0.04) };
  });
  const selected = alternatives[0].score < alternatives[1].score ? alternatives[0] : alternatives[1];
  const count = Math.max(1, Math.ceil(selected.arc / 0.2));
  const detour: BallPoint[] = Array.from({ length: count + 1 }, (_, i) => {
    const angle = selected.start + selected.direction * selected.arc * i / count;
    return { x: pin.x + Math.cos(angle) * radius, y: pin.y + Math.sin(angle) * radius };
  });
  detour.push(b);
  const result: BallPoint[] = [];
  let previous = a;
  for (const point of detour) {
    // The chosen nail is already cleared by the tangent construction; any
    // neighbouring nail still receives the same collision/clearance treatment.
    result.push(...clearSegment(previous, point, handedness, depth + 1));
    previous = point;
  }
  return result;
}

function pinSafeRoute(raw: BallPoint[], handedness: number): BallPoint[] {
  // A sampled rail or a deliberately weak launch can initially land *inside*
  // a nail. Resolve that penetration before calculating exterior tangents.
  const exterior = raw.map(point => {
    let resolved = { ...point };
    for (const pin of BOARD_PINS) {
      const minimum = pin.r + BALL_RADIUS + 1.8;
      const dx = resolved.x - pin.x;
      const dy = resolved.y - pin.y;
      const squared = dx * dx + dy * dy;
      if (squared < minimum * minimum) {
        const d = Math.sqrt(squared);
        const angle = d > .001 ? Math.atan2(resolved.y - pin.y, resolved.x - pin.x) : -Math.PI / 2;
        resolved = { x: pin.x + Math.cos(angle) * minimum, y: pin.y + Math.sin(angle) * minimum };
      }
    }
    return resolved;
  });
  const safe = [exterior[0]];
  for (let i = 1; i < exterior.length; i++) safe.push(...clearSegment(safe[safe.length - 1], exterior[i], handedness));
  return safe;
}

function equalTimePoints(path: BallPoint[], speedScale: number): { points: BallPoint[]; durationMs: number } {
  const times = [0];
  let launchRail = true;
  for (let i = 1; i < path.length; i++) {
    const point = path[i];
    if (point.y < 70) launchRail = false;
    const speed = launchRail && point.x > 550
      ? 740 + point.y * .8
      : point.y < 110 ? 425 : 160 + Math.sqrt(Math.max(0, point.y - 105) * 500);
    times.push(times[i - 1] + distance(path[i - 1], point) / (speed * speedScale) * 1000);
  }
  const durationMs = Math.round(times[times.length - 1]);
  // Four millisecond samples keep even a fast launch's interpolated chord
  // outside a nail after travelling around its rounded contact surface.
  const count = Math.max(2, Math.ceil(durationMs / 4));
  const points: BallPoint[] = [];
  let segment = 1;
  for (let i = 0; i <= count; i++) {
    const t = durationMs * i / count;
    while (segment < times.length - 1 && times[segment] < t) segment++;
    const span = times[segment] - times[segment - 1];
    points.push(lerp(path[segment - 1], path[segment], span ? clamp((t - times[segment - 1]) / span, 0, 1) : 1));
  }
  points[0] = { ...path[0] };
  points[points.length - 1] = { ...path[path.length - 1] };
  return { points, durationMs };
}

export function createBallFlight({ power: rawPower, mode, attackerOpen }: BallLaunch, random: () => number = Math.random): BallFlight {
  const power = clamp(Number.isFinite(rawPower) ? rawPower : 56, 0, 100);
  const rightMode = mode !== "normal";
  const lane = power > 75 || power < 28 ? "right" : "left";
  const accuracy = Math.exp(-Math.pow((power - (rightMode ? 88 : 56)) / (rightMode ? 17 : 23), 2));
  const chance = random();
  const correctLane = rightMode ? lane === "right" && power >= 28 : lane === "left";
  const entryChance = correctLane ? (attackerOpen && rightMode ? .74 : rightMode ? .52 : .22) * accuracy : .012;
  const prizeChance = power >= 28 ? .1 + accuracy * .045 : .015;
  const target: BallTarget = chance < entryChance
    ? attackerOpen && rightMode ? "attacker" : "start"
    : chance < entryChance + prizeChance ? "prize" : "out";
  const jitter = (random() - .5) * 5;
  const launch = { x: 568, y: 602 };
  const path: BallPoint[] = [launch];
  if (power < 28) {
    const apex = 365 - power * 6;
    path.push(...cubic(launch, { x: 585, y: 490 }, { x: 575, y: apex - 45 }, { x: 551, y: apex }, 26));
    path.push(...cubic(path[path.length - 1], { x: 536, y: apex + 30 }, { x: 548, y: 330 }, { x: 542, y: 397 }, 30));
  } else {
    path.push(...cubic(launch, { x: 594, y: 344 }, { x: 585, y: 139 }, { x: 549, y: 83 }, 35));
    if (lane === "left") {
      path.push(...cubic(path[path.length - 1], { x: 492, y: 13 }, { x: 111, y: 12 }, { x: 55, y: 111 }, 45));
    } else {
      path.push(...cubic(path[path.length - 1], { x: 533, y: 55 }, { x: 519, y: 78 }, { x: 535, y: 119 }, 15));
    }
    // Alternating shoulder pins give a visible, small loss of energy at each
    // contact. These are the very same pins drawn on the cabinet.
    const side = lane === "left" ? 0 : 1;
    for (let i = 0; i < 6; i++) {
      const y = 147 + i * 43;
      const outer = side ? 562 : 38;
      const inner = side ? 531 : 69;
      path.push({ x: outer + (side ? -9.4 : 9.4), y: y - 2 });
      if (i < 5) path.push({ x: inner + (side ? 9.4 : -9.4), y: y + 18 });
    }
    path.push({ x: lane === "left" ? 58 : 542, y: 398 });
  }
  // A sequence of shallow ricochets across the first row opens into the lower
  // nail field. Outcomes are fixed at launch; the routes never cross the LCD.
  const end = BALL_TARGETS[target];
  const fromLeft = lane === "left";
  const rimPins = BOARD_PINS.filter(pin => pin.y === 418 && (fromLeft ? pin.x < end.x - 30 : pin.x > end.x + 30));
  if (!fromLeft) rimPins.reverse();
  for (const [i, pin] of rimPins.entries()) {
    path.push({ x: pin.x + (fromLeft ? -5 : 5), y: pin.y - 8.5 });
    path.push({ x: pin.x + (fromLeft ? 13 : -13), y: 399 + (i % 2) * 2 + jitter * .15 });
  }
  if (target === "start") path.push({ x: 300 + jitter, y: 465 }, { x: 300 + jitter * .3, y: 493 });
  if (target === "prize") path.push({ x: 157 + jitter, y: 490 }, { x: 150 + jitter * .3, y: 545 });
  if (target === "attacker") path.push({ x: 435 + jitter, y: 490 }, { x: 425 + jitter * .3, y: 546 });
  if (target === "out") path.push({ x: 292 + jitter * 4, y: 468 }, { x: 315 + jitter, y: 545 }, { x: 300, y: 590 });
  path.push({ ...end });
  const safe = pinSafeRoute(path, random() < .5 ? -1 : 1);
  const timed = equalTimePoints(safe, .96 + random() * .08);
  const bounces = BOARD_PINS.filter(pin => safe.some(point => {
    const dx = point.x - pin.x;
    const dy = point.y - pin.y;
    return dx * dx + dy * dy < Math.pow(pin.r + BALL_RADIUS + 2.2, 2);
  })).length;
  return { ...timed, target, lane, bounces };
}

export function sampleBallFlight(flight: BallFlight, progress: number): BallPoint {
  const position = clamp(Number.isFinite(progress) ? progress : 0, 0, 1) * (flight.points.length - 1);
  const index = Math.floor(position);
  return lerp(flight.points[index], flight.points[Math.min(index + 1, flight.points.length - 1)], position - index);
}
