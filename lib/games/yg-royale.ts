import { ROYALE_CARDS, ROYALE_DEFAULT_DECK, royaleCard, royaleKillPoints, type RoyaleCard } from "./yg-royale-cards";

export const ROYALE = {
  gameId: "yg-clash-royale-defense", stepMs: 50, maxChunkTicks: 200,
  worldWidth: 600, worldHeight: 880, maxHp: 5000, maxElixir: 10,
  riverTop: 408, riverBottom: 472, bridges: [165, 435] as readonly number[], bridgeHalfWidth: 42,
  deployMinY: 500, deployMaxY: 760, deployMinX: 32, deployMaxX: 568,
  playerTower: { x: 300, y: 810 }, enemySpawn: { x: 300, y: 70 },
  maxUnits: 96, maxUnitsPerSide: 48, maxEffects: 24, towerRadius: 38,
} as const;

export type RoyaleInput = { tick: number; slot: number; x: number; y: number };
export type RoyaleSide = "player" | "enemy";
export type RoyaleUnit = {
  id: number; cardId: string; side: RoyaleSide; x: number; y: number;
  hp: number; maxHp: number; cooldown: number; spawnTick: number; hitUntil: number;
  attackUntil: number; slowUntil: number; walkTicks: number; shield: number; hitCount: number; damageScale: number;
};
export type RoyaleEffect = {
  id: number; kind: "deploy" | "hit" | "projectile" | "burst" | "tower" | "death" | "wave" | "dodge";
  x: number; y: number; tx?: number; ty?: number; side: RoyaleSide; cardId?: string;
  amount?: number; tick: number; until: number;
};
export type RoyaleState = {
  kind: "yg-royale"; version: 2; preparedAt: number; rng: number; tick: number;
  status: "playing" | "finished"; score: number; playerHp: number; elixir: number;
  deck: string[]; hand: string[]; queue: string[]; units: RoyaleUnit[]; effects: RoyaleEffect[];
  nextId: number; nextEffectId: number; nextSpawnTick: number; towerCooldown: number;
  kills: number; deployments: number; damageTaken: number; bestCombo: number; waveLevel: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const sq = (value: number) => value * value;
const distanceSquared = (a: { x: number; y: number }, b: { x: number; y: number }) => sq(a.x - b.x) + sq(a.y - b.y);
const safeDamage = (value: number) => Math.max(1, Math.min(1_000_000, Math.round(value)));

export function validateRoyaleDeck(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== 8 || new Set(value).size !== 8
    || value.some((id: unknown) => typeof id !== "string" || !ROYALE_CARDS.some((card) => card.id === id))) {
    throw new Error("デッキは異なるキャラクターを8枚選んでください。");
  }
  return Array.from(value) as string[];
}

export function validateRoyaleInputs(value: unknown): RoyaleInput[] {
  if (!Array.isArray(value) || value.length > ROYALE.maxChunkTicks) throw new Error("出撃履歴を確認してください。");
  let previousTick = 0;
  return Array.from(value, (entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("出撃履歴を確認してください。");
    const { tick, slot, x, y } = entry as Partial<RoyaleInput>;
    if (typeof tick !== "number" || !Number.isSafeInteger(tick) || tick <= previousTick
      || typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot > 3
      || typeof x !== "number" || !Number.isInteger(x) || x < ROYALE.deployMinX || x > ROYALE.deployMaxX
      || typeof y !== "number" || !Number.isInteger(y) || y < ROYALE.deployMinY || y > ROYALE.deployMaxY) {
      throw new Error("出撃する場所・カード・操作の順番を確認してください。");
    }
    previousTick = tick;
    return { tick, slot, x, y };
  });
}

export function royaleDifficulty(tick: number) {
  const seconds = Math.max(0, tick) * ROYALE.stepMs / 1000;
  const overtime = Math.max(0, seconds - 180);
  return {
    level: 1 + Math.floor(seconds / 30), seconds,
    spawnEveryTicks: Math.max(10, Math.round(70 - seconds * 0.18)),
    batch: Math.min(5, 1 + Math.floor(seconds / 65)),
    healthMultiplier: 1 + seconds * 0.0035 + Math.pow(overtime, 1.2) * 0.0015,
    damageMultiplier: 1 + seconds * 0.005 + Math.pow(overtime, 1.45) * 0.002,
    elixirPerSecond: seconds < 60 ? 0.8 : seconds < 120 ? 1.25 : 1.8,
    label: seconds < 60 ? "開戦" : seconds < 120 ? "増援ラッシュ" : seconds < 180 ? "大軍襲来" : "限界サドンデス",
  };
}

export function createRoyale(seed: number, preparedAt = 0, deck: readonly string[] = ROYALE_DEFAULT_DECK): RoyaleState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff || !Number.isSafeInteger(preparedAt) || preparedAt < 0) {
    throw new Error("ゲームの開始データを確認してください。");
  }
  const selected = validateRoyaleDeck(deck);
  return {
    kind: "yg-royale", version: 2, preparedAt, rng: seed || 0x6d2b79f5, tick: 0,
    status: "playing", score: 0, playerHp: ROYALE.maxHp, elixir: 7,
    deck: selected, hand: selected.slice(0, 4), queue: selected.slice(4), units: [], effects: [],
    nextId: 1, nextEffectId: 1, nextSpawnTick: 80, towerCooldown: 0,
    kills: 0, deployments: 0, damageTaken: 0, bestCombo: 0, waveLevel: 0,
  };
}

export function royaleCanDeploy(state: RoyaleState, slot: number, x: number, y: number): boolean {
  if (state.status !== "playing" || !Number.isInteger(slot) || slot < 0 || slot > 3
    || !Number.isInteger(x) || !Number.isInteger(y) || x < ROYALE.deployMinX || x > ROYALE.deployMaxX
    || y < ROYALE.deployMinY || y > ROYALE.deployMaxY || !state.hand[slot]) return false;
  const card = royaleCard(state.hand[slot]);
  return state.elixir + 1e-7 >= card.cost
    && state.units.length + card.count <= ROYALE.maxUnits
    && state.units.filter((unit) => unit.side === "player").length + card.count <= ROYALE.maxUnitsPerSide;
}

function effect(state: RoyaleState, value: Omit<RoyaleEffect, "id" | "tick" | "until">, duration = 12) {
  state.effects.push({ ...value, id: state.nextEffectId++, tick: state.tick, until: state.tick + duration });
  if (state.effects.length > ROYALE.maxEffects) state.effects.splice(0, state.effects.length - ROYALE.maxEffects);
}

function random(state: RoyaleState) {
  let value = state.rng;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng / 0x1_0000_0000;
}

type Damage = { targetId?: number; tower?: "player"; amount: number; source: RoyaleSide; slow?: boolean; fromTower?: boolean };

function spawn(state: RoyaleState, card: RoyaleCard, side: RoyaleSide, x: number, y: number, damage: Damage[]) {
  const difficulty = royaleDifficulty(state.tick);
  const hpScale = side === "enemy" ? difficulty.healthMultiplier : 1;
  const damageScale = side === "enemy" ? difficulty.damageMultiplier : 1;
  const layout = card.count === 1 ? [[0, 0]] : card.count === 3 ? [[-17, -9], [17, -9], [0, 17]] : [[-17, -14], [17, -14], [-17, 14], [17, 14]];
  for (const [dx, dy] of layout) {
    const hp = Math.round(card.hp * hpScale);
    state.units.push({ id: state.nextId++, cardId: card.id, side,
      x: clamp(x + dx, 20, 580), y: clamp(y + dy, 115, 780), hp, maxHp: hp,
      cooldown: 6, spawnTick: state.tick, hitUntil: 0, attackUntil: 0, slowUntil: 0,
      walkTicks: 0, shield: card.trait === "shield" ? Math.round(320 * hpScale) : 0,
      hitCount: 0, damageScale });
  }
  effect(state, { kind: card.trait === "slam" ? "burst" : "deploy", x, y, side, cardId: card.id }, 16);
  if (card.trait === "slam") {
    for (const enemy of state.units) {
      if (enemy.side !== side && !royaleCard(enemy.cardId).air && distanceSquared(enemy, { x, y }) <= sq(100)) {
        damage.push({ targetId: enemy.id, amount: safeDamage(180 * damageScale), source: side });
      }
    }
  }
}

function deploy(state: RoyaleState, input: RoyaleInput, damage: Damage[]) {
  if (!royaleCanDeploy(state, input.slot, input.x, input.y)) throw new Error("エリクサーや出撃可能な場所を確認してください。");
  const card = royaleCard(state.hand[input.slot]);
  state.elixir = Math.max(0, state.elixir - card.cost);
  state.hand[input.slot] = state.queue.shift()!;
  state.queue.push(card.id);
  state.deployments += 1;
  spawn(state, card, "player", input.x, input.y, damage);
}

function spawnEnemies(state: RoyaleState, damage: Damage[]) {
  const difficulty = royaleDifficulty(state.tick);
  const early = ["kawanabe-knight", "abe-guardian", "kawataka-squad", "shibata-dodger"];
  const middle = [...early, "kitazawa-archer", "yamaki-bomber", "kan-bats", "ramen-negishi", "kobayashi-runner", "goto-sinker"];
  const pool = difficulty.seconds < 25 ? early : difficulty.seconds < 65 ? middle : ROYALE_CARDS.map((card) => card.id);
  // Reinforcements keep getting stronger even when the bounded entity pool is full.
  for (const unit of state.units) {
    if (unit.side !== "enemy") continue;
    const maxHp = Math.round(royaleCard(unit.cardId).hp * difficulty.healthMultiplier);
    unit.hp += Math.max(0, maxHp - unit.maxHp);
    unit.maxHp = Math.max(unit.maxHp, maxHp);
    unit.damageScale = Math.max(unit.damageScale, difficulty.damageMultiplier);
  }
  let count = state.units.filter((unit) => unit.side === "enemy").length;
  for (let batch = 0; batch < difficulty.batch; batch++) {
    const card = royaleCard(pool[Math.floor(random(state) * pool.length)]);
    const lane = random(state) < 0.5 ? 165 : 435;
    const x = lane + Math.round((random(state) - 0.5) * 46);
    if (count + card.count > ROYALE.maxUnitsPerSide || state.units.length + card.count > ROYALE.maxUnits) continue;
    spawn(state, card, "enemy", x, 135 + (batch % 2) * 28, damage);
    count += card.count;
  }
  if (difficulty.level > state.waveLevel) {
    state.waveLevel = difficulty.level;
    effect(state, { kind: "wave", ...ROYALE.enemySpawn, side: "enemy", amount: difficulty.level }, 20);
  }
  state.nextSpawnTick = state.tick + difficulty.spawnEveryTicks;
}

function walk(unit: RoyaleUnit, destination: { x: number; y: number }, card: RoyaleCard, tick: number) {
  let target = destination;
  if (!card.air) {
    const crossingUp = unit.y >= ROYALE.riverBottom && destination.y < ROYALE.riverBottom;
    const crossingDown = unit.y <= ROYALE.riverTop && destination.y > ROYALE.riverTop;
    const onRiver = unit.y > ROYALE.riverTop && unit.y < ROYALE.riverBottom;
    if (crossingUp || crossingDown || onRiver) {
      const bridgeX = Math.abs(unit.x - 165) <= Math.abs(unit.x - 435) ? 165 : 435;
      const aligned = Math.abs(unit.x - bridgeX) < ROYALE.bridgeHalfWidth - card.radius - 4;
      if (onRiver || aligned) target = { x: bridgeX, y: destination.y < unit.y ? ROYALE.riverTop - 8 : ROYALE.riverBottom + 8 };
      else target = { x: bridgeX, y: crossingUp ? ROYALE.riverBottom + card.radius + 8 : ROYALE.riverTop - card.radius - 8 };
    }
  }
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.1) return;
  const charge = card.trait === "charge" && unit.walkTicks >= 30 ? 1.5 : 1;
  const step = Math.min(length, card.speed * ROYALE.stepMs / 1000 * (unit.slowUntil > tick ? 0.55 : 1) * charge);
  unit.x = clamp(unit.x + dx / length * step, 20, 580);
  unit.y = clamp(unit.y + dy / length * step, 105, 785);
  unit.walkTicks += 1;
}

function unitActs(state: RoyaleState, unit: RoyaleUnit, damage: Damage[]) {
  if (unit.hp <= 0) return;
  const card = royaleCard(unit.cardId);
  let target: RoyaleUnit | undefined;
  // Defenders actively intercept the next enemy rather than attacking an empty
  // enemy castle. Attackers acquire nearby defenders, otherwise pressing on.
  let closest = unit.side === "player" ? Infinity : sq(Math.max(165, card.range + 55));
  for (const candidate of state.units) {
    if (candidate.side === unit.side || candidate.hp <= 0 || (card.targets === "ground" && royaleCard(candidate.cardId).air)) continue;
    const distance = distanceSquared(unit, candidate);
    if (distance < closest || (distance === closest && candidate.id < (target?.id ?? Infinity))) {
      closest = distance; target = candidate;
    }
  }
  if (unit.cooldown > 0) unit.cooldown -= 1;
  if (!target && unit.side === "player") {
    // Keep a lane presence between waves, with no empty-space attacks or score.
    const lane = Math.abs(unit.x - 165) <= Math.abs(unit.x - 435) ? 165 : 435;
    walk(unit, { x: lane, y: 255 }, card, state.tick);
    return;
  }
  const destination = target ?? ROYALE.playerTower;
  const targetRadius = target ? royaleCard(target.cardId).radius : ROYALE.towerRadius;
  const inRange = distanceSquared(unit, destination) <= sq(card.range + targetRadius);
  if (!inRange) { walk(unit, destination, card, state.tick); return; }
  if (unit.cooldown > 0) return;
  const charged = card.trait === "charge" && unit.walkTicks >= 30;
  const amount = safeDamage(card.damage * unit.damageScale * (charged ? 2 : 1));
  unit.cooldown = card.attackTicks;
  unit.attackUntil = state.tick + 7;
  unit.walkTicks = 0;
  const source = unit.side;
  if (target) damage.push({ targetId: target.id, amount, source, slow: card.trait === "slow" });
  else damage.push({ tower: "player", amount, source });
  if (card.splash > 0) {
    for (const victim of state.units) {
      if (victim.side === source || victim.id === target?.id || victim.hp <= 0
        || (card.targets === "ground" && royaleCard(victim.cardId).air)) continue;
      if (distanceSquared(victim, destination) <= sq(card.splash + royaleCard(victim.cardId).radius)) {
        damage.push({ targetId: victim.id, amount, source, slow: card.trait === "slow" });
      }
    }
    if (source === "enemy" && target && distanceSquared(ROYALE.playerTower, destination) <= sq(card.splash + ROYALE.towerRadius)) damage.push({ tower: "player", amount, source });
  }
  effect(state, { kind: card.range > 65 || card.air ? "projectile" : card.splash > 0 || charged ? "burst" : "hit",
    x: unit.x, y: unit.y, tx: destination.x, ty: destination.y, side: source, cardId: card.id, amount }, card.range > 65 ? 8 : 6);
}

function towerActs(state: RoyaleState, damage: Damage[]) {
  if (state.towerCooldown > 0) { state.towerCooldown -= 1; return; }
  const origin = ROYALE.playerTower;
  let closest = sq(250);
  let target: RoyaleUnit | undefined;
  for (const unit of state.units) {
    if (unit.side === "player" || unit.hp <= 0) continue;
    const distance = distanceSquared(unit, origin);
    if (distance < closest) { closest = distance; target = unit; }
  }
  if (!target) return;
  state.towerCooldown = 13;
  const amount = 100;
  damage.push({ targetId: target.id, amount, source: "player", fromTower: true });
  effect(state, { kind: "projectile", ...origin, tx: target.x, ty: target.y, side: "player", amount }, 7);
}

function applyDamage(state: RoyaleState, damage: Damage[]) {
  const byId = new Map(state.units.map((unit) => [unit.id, unit]));
  const destroyed = new Set<number>();
  let kills = 0;
  for (let index = 0; index < damage.length; index++) {
    const hit = damage[index];
    if (hit.tower) {
      state.damageTaken += Math.min(state.playerHp, hit.amount);
      state.playerHp = Math.max(0, state.playerHp - hit.amount);
      effect(state, { kind: "tower", ...ROYALE.playerTower, side: hit.source, amount: hit.amount }, 12);
      continue;
    }
    const unit = byId.get(hit.targetId!);
    if (!unit || destroyed.has(unit.id)) continue;
    const card = royaleCard(unit.cardId);
    if (!hit.fromTower) unit.hitCount += 1;
    if (!hit.fromTower && card.trait === "dodge" && unit.hitCount % 3 === 0) {
      effect(state, { kind: "dodge", x: unit.x, y: unit.y, side: unit.side, cardId: card.id }, 10);
      continue;
    }
    const absorbed = Math.min(unit.shield, hit.amount);
    unit.shield -= absorbed;
    unit.hp -= hit.amount - absorbed;
    unit.hitUntil = state.tick + 5;
    if (hit.slow) unit.slowUntil = Math.max(unit.slowUntil, state.tick + 25);
    if (unit.hp > 0) continue;
    destroyed.add(unit.id);
    const points = unit.side === "enemy" ? royaleKillPoints(card) : 0;
    if (unit.side === "enemy") {
      kills += 1;
      state.score = Math.min(Number.MAX_SAFE_INTEGER, state.score + points);
    }
    effect(state, { kind: "death", x: unit.x, y: unit.y, side: unit.side, cardId: card.id, amount: points }, 12);
    if (card.trait === "death-burst") {
      effect(state, { kind: "burst", x: unit.x, y: unit.y, side: unit.side, cardId: card.id, amount: 180 }, 15);
      for (const victim of state.units) {
        if (victim.side !== unit.side && !royaleCard(victim.cardId).air && distanceSquared(victim, unit) <= sq(105 + royaleCard(victim.cardId).radius)) {
          damage.push({ targetId: victim.id, amount: safeDamage(180 * unit.damageScale), source: unit.side });
        }
      }
    }
  }
  state.kills += kills;
  state.bestCombo = Math.max(state.bestCombo, kills);
  state.units = state.units.filter((unit) => unit.hp > 0);
  if (state.playerHp === 0) state.status = "finished";
}

function separateUnits(state: RoyaleState) {
  // A small symmetric nudge prevents an entire squad occupying one portrait.
  // The hard entity cap keeps this bounded; ground units cannot be pushed into water.
  const nudge = (unit: RoyaleUnit, dx: number, dy: number) => {
    const card = royaleCard(unit.cardId);
    const x = clamp(unit.x + dx, 20, 580);
    const y = clamp(unit.y + dy, 105, 785);
    if (!card.air && y > ROYALE.riverTop && y < ROYALE.riverBottom
      && ROYALE.bridges.every((bridge) => Math.abs(x - bridge) > ROYALE.bridgeHalfWidth - card.radius)) return;
    unit.x = x; unit.y = y;
  };
  for (let a = 0; a < state.units.length; a++) {
    const left = state.units[a];
    const leftCard = royaleCard(left.cardId);
    for (let b = a + 1; b < state.units.length; b++) {
      const right = state.units[b];
      const rightCard = royaleCard(right.cardId);
      if (leftCard.air !== rightCard.air) continue;
      const min = (leftCard.radius + rightCard.radius) * 0.82;
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const squared = dx * dx + dy * dy;
      if (squared >= min * min) continue;
      const length = Math.sqrt(squared);
      const step = Math.min(0.9, (min - length) / 2);
      const nx = length > 0.001 ? dx / length : left.id % 2 ? 1 : -1;
      const ny = length > 0.001 ? dy / length : 0;
      nudge(left, -nx * step, -ny * step);
      nudge(right, nx * step, ny * step);
    }
  }
}

/** Fixed 20 Hz, replayable on both client and worker. Never mutates its input. */
export function advanceRoyale(current: RoyaleState, inputs: readonly RoyaleInput[], toTick: number): RoyaleState {
  if (current.kind !== "yg-royale" || current.version !== 2) throw new Error("この対戦は旧ルールです。新しい防衛戦を始めてください。");
  if (!Number.isSafeInteger(toTick) || !Number.isSafeInteger(current.tick) || toTick <= current.tick || toTick - current.tick > ROYALE.maxChunkTicks) {
    throw new Error("ゲームの経過時間を確認してください。");
  }
  const history = validateRoyaleInputs(inputs);
  if (history.some((input) => input.tick <= current.tick || input.tick > toTick) || (current.status === "finished" && history.length)) {
    throw new Error("出撃履歴の時刻を確認してください。");
  }
  const state: RoyaleState = { ...current, deck: [...current.deck], hand: [...current.hand], queue: [...current.queue],
    units: current.units.map((unit) => ({ ...unit })), effects: current.effects.map((entry) => ({ ...entry })) };
  let inputIndex = 0;
  while (state.tick < toTick && state.status === "playing") {
    state.tick += 1;
    state.effects = state.effects.filter((entry) => entry.until > state.tick);
    state.elixir = Math.min(ROYALE.maxElixir, state.elixir + royaleDifficulty(state.tick).elixirPerSecond * ROYALE.stepMs / 1000);
    const damage: Damage[] = [];
    if (history[inputIndex]?.tick === state.tick) { deploy(state, history[inputIndex], damage); inputIndex += 1; }
    if (state.tick >= state.nextSpawnTick) spawnEnemies(state, damage);
    towerActs(state, damage);
    for (const unit of state.units) unitActs(state, unit, damage);
    separateUnits(state);
    applyDamage(state, damage);
  }
  // Inputs beyond the loss tick must be rejected rather than silently accepted.
  if (inputIndex !== history.length) throw new Error("ゲーム終了後の出撃はできません。");
  return state;
}
