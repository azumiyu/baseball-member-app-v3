export const DODGE = {
  stepMs: 20,
  maxChunkTicks: 500,
  maxHp: 5,
  world: 1_000,
  playerX: 140,
  playerRadiusX: 35,
  playerRadiusY: 65,
  playerSpeed: 1_100,
  playerMinY: 80,
  playerMaxY: 920,
  spawnX: 1_050,
  hitGraceTicks: 20,
  freezeTicks: 50,
  invincibleTicks: 250,
  stonesTicks: 100,
  ballRadius: 18,
  stoneRadius: 24,
  pickupRadius: 26,
} as const;

export type DodgeMove = { tick: number; y: number };
export type DodgeObject = {
  id: number;
  x: number;
  y: number;
  type: "ball" | "stone" | "heart" | "mystery";
  speed: number;
};
export type DodgeState = {
  kind: "shibata-dodge";
  preparedAt: number;
  rng: number;
  tick: number;
  y: number;
  targetY: number;
  hp: number;
  score: number;
  objects: DodgeObject[];
  nextSpawnTick: number;
  nextId: number;
  frozenUntil: number;
  invincibleUntil: number;
  stonesUntil: number;
  hitUntil: number;
  lastEffect: "none" | "freeze" | "invincible" | "heal" | "stones";
  effectAt: number;
  status: "playing" | "finished";
};

export function createDodge(seed: number, preparedAt = 0): DodgeState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff
    || !Number.isSafeInteger(preparedAt) || preparedAt < 0) {
    throw new Error("ゲームの開始データを確認してください。");
  }
  return {
    kind: "shibata-dodge", preparedAt, rng: seed || 0x6d2b79f5, tick: 0,
    y: 500, targetY: 500, hp: DODGE.maxHp, score: 0, objects: [],
    nextSpawnTick: 15, nextId: 1, frozenUntil: 0, invincibleUntil: 0,
    stonesUntil: 0, hitUntil: 0, lastEffect: "none", effectAt: -1, status: "playing",
  };
}

export function validateDodgeMoves(value: unknown): DodgeMove[] {
  if (!Array.isArray(value) || value.length > DODGE.maxChunkTicks) {
    throw new Error("操作履歴を確認してください。");
  }
  let previousTick = 0;
  return Array.from(value, (entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("操作履歴を確認してください。");
    const { tick, y } = entry as Partial<DodgeMove>;
    if (typeof tick !== "number" || !Number.isSafeInteger(tick) || tick <= previousTick
      || typeof y !== "number" || !Number.isInteger(y) || y < 0 || y > DODGE.world) {
      throw new Error("移動先と操作の順番を確認してください。");
    }
    previousTick = tick;
    return { tick, y };
  });
}

export function dodgeDifficulty(tick: number) {
  const seconds = Math.max(0, tick) * DODGE.stepMs / 1_000;

  // 従来の最高速度1600に到達する時間
  const limitSeconds = (1_600 - 530) / 7;

  // 最高速度到達後は超緩やかに加速
  const speed =
    seconds <= limitSeconds
      ? 530 + seconds * 7
      : 1_600 + 45 * Math.log1p(
          (seconds - limitSeconds) / 60
        );

  return {
    level: 1 + Math.floor(seconds / 15),
    seconds,
    speed,
    spawnEveryTicks: Math.max(
      1,
      Math.round(10 - seconds * 0.01)
    ),
  };
}
export function dodgeObjectType(object: DodgeObject, state: DodgeState): DodgeObject["type"] {
  return object.type === "ball" && state.tick < state.stonesUntil ? "stone" : object.type;
}

function objectRadius(type: DodgeObject["type"]) {
  return type === "ball" ? DODGE.ballRadius : type === "stone" ? DODGE.stoneRadius : DODGE.pickupRadius;
}

function collides(object: DodgeObject, oldX: number, oldY: number, state: DodgeState) {
  const radius = objectRadius(dodgeObjectType(object, state));
  const radiusX = DODGE.playerRadiusX + radius;
  const radiusY = DODGE.playerRadiusY + radius;
  const x = (oldX - DODGE.playerX) / radiusX;
  const y = (object.y - oldY) / radiusY;
  const dx = (object.x - oldX) / radiusX;
  const dy = (oldY - state.y) / radiusY;
  const length = dx * dx + dy * dy;
  const fraction = length === 0 ? 0 : Math.max(0, Math.min(1, -(x * dx + y * dy) / length));
  return (x + dx * fraction) ** 2 + (y + dy * fraction) ** 2 <= 1;
}

export function advanceDodge(current: DodgeState, moves: readonly DodgeMove[], toTick: number): DodgeState {
  if (!Number.isSafeInteger(toTick) || !Number.isSafeInteger(current.tick)
    || toTick <= current.tick || toTick - current.tick > DODGE.maxChunkTicks) {
    throw new Error("ゲームの経過時間を確認してください。");
  }
  const history = validateDodgeMoves(moves);
  if (history.some((move) => move.tick <= current.tick || move.tick > toTick)) {
    throw new Error("操作履歴の時刻を確認してください。");
  }
  const state: DodgeState = { ...current, objects: current.objects.map((object) => ({ ...object })) };
  let inputIndex = 0;
  const random = () => {
    let value = state.rng;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    state.rng = value >>> 0;
    return state.rng / 0x1_0000_0000;
  };

  while (state.tick < toTick && state.status === "playing") {
    const previousTick = state.tick;
    const previousY = state.y;
    state.tick += 1;
    if (history[inputIndex]?.tick === state.tick) {
      state.targetY = Math.max(DODGE.playerMinY, Math.min(DODGE.playerMaxY, history[inputIndex].y));
      inputIndex += 1;
    }
    if (previousTick >= state.frozenUntil) {
      const distance = state.targetY - state.y;
      const step = DODGE.playerSpeed * DODGE.stepMs / 1_000;
      state.y += Math.sign(distance) * Math.min(Math.abs(distance), step);
    }

    if (state.tick >= state.nextSpawnTick) {
      const difficulty = dodgeDifficulty(state.tick);
      const roll = random();
      const type: DodgeObject["type"] = roll < 0.82 ? "ball" : roll < 0.90 ? "stone" : roll < 0.95 ? "heart" : "mystery";
      state.objects.push({
        id: state.nextId++, x: DODGE.spawnX,
        y: DODGE.playerMinY + random() * (DODGE.playerMaxY - DODGE.playerMinY),
        type, speed: difficulty.speed * (0.92 + random() * 0.16),
      });
      state.nextSpawnTick = state.tick + Math.max(7, Math.round(difficulty.spawnEveryTicks * (0.8 + random() * 0.4)));
    }

    const remaining: DodgeObject[] = [];
    for (const object of state.objects) {
      const oldX = object.x;
      object.x -= object.speed * DODGE.stepMs / 1_000;
      if (state.status === "finished") {
        remaining.push(object);
        continue;
      }
      const type = dodgeObjectType(object, state);
      if (collides(object, oldX, previousY, state)) {
        if (type === "heart") {
          state.hp = Math.min(DODGE.maxHp, state.hp + 1);
          state.lastEffect = "heal";
          state.effectAt = state.tick;
        } else if (type === "mystery") {
          const effect = Math.floor(random() * 4);
          state.lastEffect = (["freeze", "invincible", "heal", "stones"] as const)[effect];
          state.effectAt = state.tick;
          if (effect === 0) state.frozenUntil = state.tick + DODGE.freezeTicks;
          else if (effect === 1) state.invincibleUntil = state.tick + DODGE.invincibleTicks;
          else if (effect === 2) state.hp = DODGE.maxHp;
          else state.stonesUntil = state.tick + DODGE.stonesTicks;
        } else if (state.tick >= state.invincibleUntil && state.tick >= state.hitUntil) {
          state.hp = Math.max(0, state.hp - (type === "stone" ? 2 : 1));
          state.hitUntil = state.tick + DODGE.hitGraceTicks;
          if (state.hp === 0) state.status = "finished";
        }
        continue;
      }
      if (object.x + objectRadius(type) < 0) {
        if (type === "ball") state.score += 1;
      } else {
        remaining.push(object);
      }
    }
    state.objects = remaining;
  }
  return state;
}
