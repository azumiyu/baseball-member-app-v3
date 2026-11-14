import type { AuthMember } from "../auth-types";
import { db, digest, random, token, validToken } from "../server";
import type { LeaderboardEntry } from "./api-types";
import { MARATHON, marathonAvailableWaterMl, marathonJapanDate, marathonJapanDayEnd,
  marathonReservoirBalance,
  marathonMood, marathonNoWaterWindow, marathonShopPrice, marathonDiscountedShopPrice,
  marathonWaitMs, rollMarathonGacha,
  MARATHON_DRUNK_DURATION_MS, rollMarathonDrunkEffect,
  type MarathonSnapshot, type MarathonState, type MarathonSteal, type MarathonStealNotification,
  type MarathonReservoirDepositRequest, type MarathonShopItem, type MarathonShopPurchase, type MarathonShopRequest, type MarathonShopState,
  type MarathonStealRequest, type MarathonWater, type MarathonWaterRequest } from "./marathon";

type Score = Omit<LeaderboardEntry, "rank"> & {
  handMl: number; reservoirMl: number; reservoirOwned: boolean;
  guardCharges: number; counterCharges: number;
};
type StoredScore = Omit<LeaderboardEntry, "rank" | "reservoirMl" | "reservoirOwned"> & {
  reservoirOwned: number; reservoirMl: number; reservoirGrowthJapanDate: string | null;
  reservoirGodCount: number; guardCharges: number; counterCharges: number;
};
type ContextRow = {
  id: string; name: string; number: string; is_admin: number; can_edit_lineup: number;
  started_at: number; last_watered_at: number; revision: number; total_water_ml: number;
  last_giver_name: string | null; exclusive_player_id: string | null; exclusive_player_name: string | null;
  exclusive_until: number; japan_date: string | null; daily_water_count: number | null; daily_steal_count: number | null;
  receipt_json: string | null; last_steal_request_id: string | null; last_steal_result_json: string | null;
  pending_steal_count: number | null; pending_steal_ml: number | null;
  pending_steal_last_giver_name: string | null; pending_steal_version: number | null;
  pending_trap_count: number; own_pending_trap_count: number | null;
  reservoir_owned: number | null; reservoir_ml: number | null; reservoir_growth_japan_date: string | null;
  reservoir_last_deposit_at: number | null; reservoir_god_count: number | null;
  alcohol_count: number | null; alcohol_purchases: number | null;
  mini_kobayashi_count: number | null; steal_guard_charges: number | null;
  steal_counter_charges: number | null; steal_glove_count: number | null; shop_japan_date: string | null;
  guard_purchases: number | null; counter_purchases: number | null; trap_purchases: number | null;
  last_shop_purchase_json: string | null; scores_json: string;
  drunk_effect: string | null; drunk_started_at: number | null; drunk_until: number;
  drunk_rampage_goal_ml: number; drunk_rampage_awarded_ml: number;
  drunk_rampage_player_ids: string; distance_paused_ms: number;
};
export type MarathonContext = {
  member: AuthMember; sessionHash: string; state: MarathonState;
  scores: Score[]; dailyWaterCount: number; lastWater: MarathonWater | null;
  dailyStealCount: number; stealTargetCount: number; lastSteal: MarathonSteal | null;
  pendingStealNotification: MarathonStealNotification | null;
  shop: MarathonShopState; lastShopPurchase: MarathonShopPurchase | null;
};

// One indexed query authenticates and returns the shared timestamps, ranking,
// and this member's last receipt. It never updates distance or thirst in D1.
export async function readMarathonContext(req: Request): Promise<MarathonContext | null> {
  const value = token(req);
  if (!validToken(value)) return null;
  const sessionHash = await digest(value);
  const now = Date.now();
  const row = await db().prepare(`
    SELECT p.id,p.name,p.number,p.is_admin,p.can_edit_lineup,
      m.started_at,m.last_watered_at,m.revision,m.total_water_ml,m.last_giver_name,
      m.exclusive_player_id,(SELECT name FROM players WHERE id=m.exclusive_player_id) AS exclusive_player_name,
      m.exclusive_until,m.pending_trap_count,m.drunk_effect,m.drunk_started_at,m.drunk_until,
      m.drunk_rampage_goal_ml,m.drunk_rampage_awarded_ml,m.drunk_rampage_player_ids,m.distance_paused_ms,
      shop.pending_trap_count AS own_pending_trap_count,
      shop.reservoir_owned,shop.reservoir_ml,shop.reservoir_growth_japan_date,
      shop.reservoir_last_deposit_at,shop.reservoir_god_count,shop.alcohol_count,shop.alcohol_purchases,
      g.japan_date,g.water_count AS daily_water_count,g.steal_count AS daily_steal_count,
      g.last_steal_request_id,g.last_steal_result_json,
      g.pending_steal_count,g.pending_steal_ml,g.pending_steal_last_giver_name,g.pending_steal_version,
      shop.mini_kobayashi_count,shop.steal_guard_charges,shop.steal_counter_charges,shop.steal_glove_count,
      shop.japan_date AS shop_japan_date,shop.guard_purchases,shop.counter_purchases,shop.trap_purchases,
      shop.last_purchase_result_json AS last_shop_purchase_json,
      (SELECT r.result_json FROM mini_game_runs r WHERE r.game_id=? AND r.player_id=p.id) AS receipt_json,
      (SELECT json_group_array(json_object('playerId',scores.player_id,'name',scores.name,
        'number',scores.number,'score',scores.score,'achievedAt',scores.achieved_at,
        'reservoirOwned',scores.reservoir_owned,'reservoirMl',scores.reservoir_ml,
        'reservoirGrowthJapanDate',scores.reservoir_growth_japan_date,'reservoirGodCount',scores.reservoir_god_count,
        'guardCharges',scores.guard_charges,'counterCharges',scores.counter_charges))
       FROM (SELECT s.player_id,s.score,s.achieved_at,players.name,players.number
         ,COALESCE(shop_scores.reservoir_owned,0) AS reservoir_owned,
          COALESCE(shop_scores.reservoir_ml,0) AS reservoir_ml,
          shop_scores.reservoir_growth_japan_date,
          COALESCE(shop_scores.reservoir_god_count,0) AS reservoir_god_count,
          COALESCE(shop_scores.steal_guard_charges,0) AS guard_charges,
          COALESCE(shop_scores.steal_counter_charges,0) AS counter_charges
         FROM mini_game_scores s JOIN players ON players.id=s.player_id AND players.sort_order IS NOT NULL
         LEFT JOIN marathon_shop_inventory shop_scores ON shop_scores.player_id=s.player_id
         WHERE s.game_id=?) scores) AS scores_json
    FROM sessions session JOIN member_devices device ON device.hash=session.device_hash
    JOIN players p ON p.id=device.player_id AND p.sort_order IS NOT NULL
    LEFT JOIN marathon_giver_limits g ON g.player_id=p.id
    LEFT JOIN marathon_shop_inventory shop ON shop.player_id=p.id
    JOIN marathon_state m ON m.id=1
    WHERE session.hash=? AND (session.expires=0 OR session.expires>?)
  `).bind(MARATHON.gameId, MARATHON.gameId, sessionHash, now).first<ContextRow>();
  if (!row) return null;
  // Finish any event persisted by the earlier gradual-award implementation.
  if (row.drunk_effect === "rampage" && row.drunk_started_at !== null && row.drunk_until > row.drunk_started_at) {
    const earnedMl = row.drunk_rampage_goal_ml;
    if (earnedMl > row.drunk_rampage_awarded_ml) {
      const playerIds = JSON.parse(row.drunk_rampage_player_ids) as string[];
      const deltaMl = earnedMl - row.drunk_rampage_awarded_ml;
      const writeToken = random();
      const database = db();
      const statements = [database.prepare(`
        UPDATE marathon_state SET revision=revision+1,total_water_ml=total_water_ml+?,
          drunk_rampage_awarded_ml=?,write_token=?
        WHERE id=1 AND revision=? AND drunk_effect='rampage'
          AND drunk_started_at=? AND drunk_rampage_awarded_ml=?
      `).bind(deltaMl, earnedMl, writeToken, row.revision, row.drunk_started_at, row.drunk_rampage_awarded_ml)];
      const count = playerIds.length;
      for (let index = 0; index < count; index++) {
        const before = Math.floor(row.drunk_rampage_awarded_ml * (index + 1) / count)
          - Math.floor(row.drunk_rampage_awarded_ml * index / count);
        const after = Math.floor(earnedMl * (index + 1) / count)
          - Math.floor(earnedMl * index / count);
        const playerDelta = after - before;
        const playerId = playerIds[index];
        if (playerDelta <= 0 || !playerId) continue;
        statements.push(database.prepare(`
          UPDATE mini_game_scores SET score=score+?,achieved_at=?
          WHERE game_id=? AND player_id=?
            AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
        `).bind(playerDelta, now, MARATHON.gameId, playerId, writeToken));
      }
      const result = await database.batch(statements);
      if (result[0]?.meta.changes === 1) return readMarathonContext(req);
    }
  }
  const scores: Score[] = (JSON.parse(row.scores_json) as StoredScore[]).map((stored) => {
    const handMl = stored.score;
    const reservoirMl = stored.reservoirOwned === 1 ? marathonReservoirBalance(
      stored.reservoirMl, stored.reservoirGrowthJapanDate, stored.reservoirGodCount, now,
    ) : 0;
    return {
      ...stored,
      handMl,
      reservoirMl,
      reservoirOwned: stored.reservoirOwned === 1,
      score: Math.min(Number.MAX_SAFE_INTEGER, handMl + reservoirMl),
    };
  }).sort((a, b) => b.score - a.score || a.achievedAt - b.achievedAt || a.playerId.localeCompare(b.playerId));
  const ownIndex = scores.findIndex((score) => score.playerId === row.id);
  const ownScore = ownIndex >= 0 ? scores[ownIndex]?.handMl ?? 0 : 0;
  const eligibleTargets = getEligibleStealTargets(scores, row.id, ownIndex);
  const today = marathonJapanDate(now);
  const pendingStealNotification = (row.pending_steal_count ?? 0) > 0
    ? { version: row.pending_steal_version ?? 0, count: row.pending_steal_count ?? 0,
        stolenMl: row.pending_steal_ml ?? 0, lastGiverName: row.pending_steal_last_giver_name ?? "メンバー" }
    : null;
  const miniKobayashiCount = row.mini_kobayashi_count ?? 0;
  const stealGuardCharges = row.steal_guard_charges ?? 0;
  const stealCounterCharges = row.steal_counter_charges ?? 0;
  const stealGloveCount = row.steal_glove_count ?? 0;
  const alcoholCount = row.alcohol_count ?? 0;
  const alcoholPurchasesToday = row.shop_japan_date === today ? row.alcohol_purchases ?? 0 : 0;
  const reservoirOwned = row.reservoir_owned === 1;
  const reservoirGodCount = row.reservoir_god_count ?? 0;
  const reservoirMl = reservoirOwned ? marathonReservoirBalance(
    row.reservoir_ml ?? 0, row.reservoir_growth_japan_date, reservoirGodCount, now,
  ) : 0;
  const reservoirLastDepositAt = row.reservoir_last_deposit_at ?? null;
  const reservoirNextDepositAt = reservoirLastDepositAt === null
    ? null : reservoirLastDepositAt + MARATHON.reservoirDepositIntervalMs;
  const inventory = { miniKobayashiCount, stealGuardCharges, stealCounterCharges, stealGloveCount, reservoirGodCount };
  const drunkEffect = row.drunk_effect as MarathonState["drunkEffect"];
  const activeDrunkEffect = row.drunk_until > now ? drunkEffect : null;
  const shop: MarathonShopState = {
    walletMl: Math.min(Number.MAX_SAFE_INTEGER, ownScore + reservoirMl), handMl: ownScore, reservoirMl, reservoirOwned,
    reservoirLastDepositAt, reservoirNextDepositAt, ...inventory,
    alcoholCount, alcoholPurchasesToday,
    guardPurchasesToday: row.shop_japan_date === today ? row.guard_purchases ?? 0 : 0,
    counterPurchasesToday: row.shop_japan_date === today ? row.counter_purchases ?? 0 : 0,
    trapPurchasesToday: row.shop_japan_date === today ? row.trap_purchases ?? 0 : 0,
    pendingTrapCount: row.own_pending_trap_count ?? 0,
    pricesMl: {
      "mini-kobayashi": marathonDiscountedShopPrice(marathonShopPrice("mini-kobayashi", inventory), activeDrunkEffect, row.drunk_until, now),
      "steal-guard": marathonDiscountedShopPrice(marathonShopPrice("steal-guard", inventory), activeDrunkEffect, row.drunk_until, now),
      "steal-counter": marathonDiscountedShopPrice(marathonShopPrice("steal-counter", inventory), activeDrunkEffect, row.drunk_until, now),
      "poison-trap": marathonDiscountedShopPrice(marathonShopPrice("poison-trap", inventory), activeDrunkEffect, row.drunk_until, now),
      "steal-glove": marathonDiscountedShopPrice(marathonShopPrice("steal-glove", inventory), activeDrunkEffect, row.drunk_until, now),
      reservoir: marathonDiscountedShopPrice(marathonShopPrice("reservoir", inventory), activeDrunkEffect, row.drunk_until, now),
      "reservoir-god": marathonDiscountedShopPrice(marathonShopPrice("reservoir-god", inventory), activeDrunkEffect, row.drunk_until, now),
      alcohol: marathonDiscountedShopPrice(marathonShopPrice("alcohol", inventory), activeDrunkEffect, row.drunk_until, now),
    },
  };
  return {
    member: { id: row.id, name: row.name, number: row.number,
      isAdmin: row.is_admin === 1, canEditLineup: row.can_edit_lineup === 1 },
    sessionHash,
    state: { startedAt: row.started_at, lastWateredAt: row.last_watered_at, revision: row.revision,
      totalWaterMl: row.total_water_ml, pendingTrapCount: row.pending_trap_count, lastGiverName: row.last_giver_name,
      exclusivePlayerId: row.exclusive_player_id, exclusivePlayerName: row.exclusive_player_name,
      exclusiveUntil: row.exclusive_until, drunkEffect,
      drunkStartedAt: row.drunk_started_at, drunkUntil: row.drunk_until,
      drunkRampageGoalMl: row.drunk_rampage_goal_ml,
      drunkRampageAwardedMl: row.drunk_rampage_awarded_ml,
      drunkRampagePlayerIds: JSON.parse(row.drunk_rampage_player_ids) as string[],
      distancePausedMs: row.distance_paused_ms },
    scores,
    dailyWaterCount: row.japan_date === today ? row.daily_water_count ?? 0 : 0,
    lastWater: row.receipt_json ? JSON.parse(row.receipt_json) as MarathonWater : null,
    dailyStealCount: row.japan_date === today ? row.daily_steal_count ?? 0 : 0,
    stealTargetCount: ownScore >= MARATHON.stealMinimumScoreMl ? eligibleTargets.length : 0,
    lastSteal: row.last_steal_request_id && row.last_steal_result_json
      ? JSON.parse(row.last_steal_result_json) as MarathonSteal : null,
    pendingStealNotification,
    shop,
    lastShopPurchase: row.last_shop_purchase_json ? JSON.parse(row.last_shop_purchase_json) as MarathonShopPurchase : null,
  };
}

export function marathonSnapshot(context: MarathonContext, serverNow = Date.now()): MarathonSnapshot {
  const ranked = context.scores.map((score, index) => ({ ...score, rank: index + 1 }));
  const publicRanked: LeaderboardEntry[] = ranked.map((score) => ({
    playerId: score.playerId, name: score.name, number: score.number,
    score: score.score, achievedAt: score.achievedAt, rank: score.rank,
    handMl: score.handMl, reservoirMl: score.reservoirMl, reservoirOwned: score.reservoirOwned,
  }));
  return { member: context.member, gameId: MARATHON.gameId, run: null, serverNow,
    state: context.state, dailyWaterCount: context.dailyWaterCount, lastWater: context.lastWater,
    dailyStealCount: context.dailyStealCount, stealTargetCount: context.stealTargetCount,
    lastSteal: context.lastSteal, pendingStealNotification: context.pendingStealNotification,
    shop: context.shop, lastShopPurchase: context.lastShopPurchase,
    leaderboard: publicRanked.slice(0, 10),
    personalBest: publicRanked.find((score) => score.playerId === context.member.id) ?? null };
}

function getEligibleStealTargets(scores: Score[], playerId: string, ownIndex: number): Score[] {
  if (ownIndex < 0) return [];
  const ahead = ownIndex === 0 ? scores.filter((score) => score.playerId !== playerId) : scores.slice(0, ownIndex);
  return ahead.filter((score) => score.handMl >= 20);
}

function secureIndex(length: number): number {
  const bound = Math.floor(0x1_0000_0000 / length) * length;
  let value = 0;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0; } while (value >= bound);
  return value % length;
}

function rollStealPercent(): number {
  const roll = secureIndex(100);
  let boundary = 0;
  for (const item of MARATHON.stealPercentWeights) {
    boundary += item.weight;
    if (roll < boundary) return item.percent;
  }
  return 5;
}

export function parseMarathonRequest(value: unknown): MarathonWaterRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { requestId, expectedRevision, alcohol } = value as Record<string, unknown>;
  return typeof requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
    && Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0
    && (alcohol === undefined || typeof alcohol === "boolean")
    ? { requestId, expectedRevision: expectedRevision as number, ...(alcohol === true ? { alcohol: true } : {}) } : null;
}

export function parseMarathonStealRequest(value: unknown): MarathonStealRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { requestId, expectedRevision } = value as Record<string, unknown>;
  return typeof requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
    && Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0
    ? { requestId, expectedRevision: expectedRevision as number } : null;
}

const marathonShopItems = new Set<MarathonShopItem>([
  "mini-kobayashi", "steal-guard", "steal-counter", "poison-trap", "steal-glove",
  "reservoir", "reservoir-god", "alcohol",
]);

export function parseMarathonShopRequest(value: unknown): MarathonShopRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { requestId, expectedRevision, item } = value as Record<string, unknown>;
  return typeof requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
    && Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0
    && typeof item === "string" && marathonShopItems.has(item as MarathonShopItem)
    ? { requestId, expectedRevision: expectedRevision as number, item: item as MarathonShopItem } : null;
}

export function parseMarathonReservoirDepositRequest(value: unknown): MarathonReservoirDepositRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { requestId, expectedRevision, amountMl } = value as Record<string, unknown>;
  return typeof requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
    && Number.isSafeInteger(expectedRevision) && (expectedRevision as number) >= 0
    && Number.isSafeInteger(amountMl) && (amountMl as number) > 0
    ? { requestId, expectedRevision: expectedRevision as number, amountMl: amountMl as number } : null;
}

export function parseMarathonNotificationVersion(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const version = (value as Record<string, unknown>).version;
  return Number.isSafeInteger(version) && (version as number) > 0 ? version as number : null;
}

export type MarathonWaterResult = {
  status: "accepted" | "duplicate" | "conflict" | "waiting" | "resting" | "daily-limit"
    | "exclusive" | "drunk" | "stopped" | "no-alcohol" | "unauthorized";
  context: MarathonContext | null;
};

/** D1 serializes the transactional batch. Exactly one CAS can consume the
 * shared thirst; a new server token guards both credit and receipt writes.
 * Duplicate in-flight requests can therefore never add the same water twice. */
export async function waterMarathon(req: Request, context: MarathonContext, request: MarathonWaterRequest): Promise<MarathonWaterResult> {
  if (context.lastWater?.requestId === request.requestId) return { status: "duplicate", context };
  if (context.state.revision !== request.expectedRevision) return { status: "conflict", context };
  const now = Date.now();
  if (request.alcohol && context.state.drunkUntil > now) return { status: "drunk", context };
  if (request.alcohol && context.shop.alcoholCount <= 0) return { status: "no-alcohol", context };
  if (context.state.drunkEffect === "stopped" && context.state.drunkUntil > now) return { status: "stopped", context };
  if (marathonNoWaterWindow(now).isResting) return { status: "resting", context };
  if (marathonWaitMs(context.state, now) > 0) return { status: "waiting", context };
  if (context.dailyWaterCount >= MARATHON.dailyWaterLimit) return { status: "daily-limit", context };
  if (context.state.exclusiveUntil > now && context.state.exclusivePlayerId !== context.member.id) return { status: "exclusive", context };

  const baseAmountMl = marathonAvailableWaterMl(context.state, now);
  const mood = marathonMood(context.state, now);
  const trapTriggered = context.state.pendingTrapCount > context.shop.pendingTrapCount;
  const gacha = trapTriggered
    ? { kind: "normal" as const, label: "毒給水トラップに引っかかった！", multiplier: 1 }
    : rollMarathonGacha();
  const leader = context.scores[0];
  const possibleStolenMl = gacha.kind === "steal" && leader && leader.playerId !== context.member.id
    ? Math.floor(leader.handMl * 0.1) : 0;
  let didSteal = possibleStolenMl > 0 && !!leader && leader.playerId !== context.member.id;
  const leaderGuardBlocked = didSteal && (leader?.guardCharges ?? 0) > 0;
  const leaderCountered = didSteal && !leaderGuardBlocked && (leader?.counterCharges ?? 0) > 0;
  if (leaderGuardBlocked || leaderCountered) didSteal = false;
  const stolenMl = didSteal ? possibleStolenMl : 0;
  const exclusive = gacha.kind === "exclusive";
  const regularWaterMultiplier = gacha.kind === "steal" ? 1 : gacha.multiplier;
  const boostedRegularMl = Math.floor(baseAmountMl * regularWaterMultiplier * (1 + context.shop.miniKobayashiCount * 0.05));
  const trapLossMl = trapTriggered
    ? -Math.min(baseAmountMl, context.shop.handMl, context.state.totalWaterMl)
    : 0;
  const amountMl = trapTriggered ? trapLossMl : didSteal ? stolenMl : boostedRegularMl;
  const gachaLabel = trapTriggered
    ? gacha.label
    : leaderGuardBlocked
      ? "強奪ガードが発動！給水量は守られました"
      : leaderCountered
        ? "強奪カウンターが発動！強奪を防ぎました"
        : gacha.kind === "steal" && !didSteal
    ? leader?.playerId === context.member.id
      ? "1位はあなたなので、通常給水になりました"
      : "1位の給水量がまだ少ないため、通常給水になりました"
    : gacha.label;
  const multiplier = didSteal ? 1 : mood.multiplier * regularWaterMultiplier;
  const receipt: MarathonWater = {
    requestId: request.requestId, amountMl, wateredAt: now, mood: mood.kind, multiplier,
    alcoholGiven: request.alcohol === true,
    moodMultiplier: mood.multiplier, gacha: gacha.kind, gachaLabel,
    gachaMultiplier: didSteal ? 1 : regularWaterMultiplier,
    stolenFromName: didSteal ? leader?.name ?? null : null,
    trapTriggered,
  };
  const drunkEffect = request.alcohol ? rollMarathonDrunkEffect() : null;
  const drunkUntil = request.alcohol ? now + MARATHON_DRUNK_DURATION_MS : null;
  const rampageGoalMl = drunkEffect === "rampage" ? 5_000 + secureIndex(15_001) : 0;
  const rampagePlayerIds = request.alcohol
    ? [...new Set([...context.scores.map((score) => score.playerId), context.member.id])]
    : [];
  receipt.drunkEffect = drunkEffect;
  const writeToken = random();
  const database = db();
  const japanDate = marathonJapanDate(now);
  const notResting = marathonNoWaterWindow(now).isResting ? 0 : 1;
  const statements = [database.prepare(`
    UPDATE marathon_state SET last_watered_at=?,revision=revision+1,total_water_ml=MAX(0,total_water_ml+?+?),
      pending_trap_count=CASE WHEN ?>0 THEN pending_trap_count-1 ELSE pending_trap_count END,
      last_giver_name=?,write_token=?,
      exclusive_player_id=CASE WHEN ?=1 THEN ? ELSE exclusive_player_id END,
      exclusive_until=CASE WHEN ?=1 THEN ? ELSE exclusive_until END,
      drunk_effect=COALESCE(?,drunk_effect),drunk_started_at=COALESCE(?,drunk_started_at),
      drunk_until=COALESCE(?,drunk_until),
      drunk_rampage_goal_ml=CASE WHEN ? IS NOT NULL THEN ? ELSE drunk_rampage_goal_ml END,
      drunk_rampage_awarded_ml=CASE WHEN ? IS NOT NULL THEN ? ELSE drunk_rampage_awarded_ml END,
      drunk_rampage_player_ids=CASE WHEN ? IS NOT NULL THEN ? ELSE drunk_rampage_player_ids END,
      distance_paused_ms=distance_paused_ms+CASE
        WHEN ? IS NOT NULL AND drunk_effect='stopped' AND drunk_started_at IS NOT NULL
        THEN MAX(0,MIN(drunk_until,drunk_started_at+?)-drunk_started_at) ELSE 0 END
    WHERE id=1 AND revision=? AND last_watered_at<=? AND ?=1
      AND (exclusive_until<=? OR exclusive_player_id=?)
      AND (?=0 OR (drunk_until<=? AND COALESCE(
        (SELECT alcohol_count FROM marathon_shop_inventory WHERE player_id=?),0)>0))
      AND COALESCE((SELECT water_count FROM marathon_giver_limits WHERE player_id=? AND japan_date=?),0)<?
      AND EXISTS (SELECT 1 FROM sessions s JOIN member_devices d ON d.hash=s.device_hash
        JOIN players p ON p.id=d.player_id WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
          AND p.id=? AND p.sort_order IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM mini_game_runs WHERE game_id=? AND player_id=? AND last_request_id=?)
  `).bind(now, didSteal ? 0 : amountMl, rampageGoalMl, trapTriggered ? 1 : 0, context.member.name, writeToken,
    exclusive ? 1 : 0, context.member.id, exclusive ? 1 : 0, marathonJapanDayEnd(now),
    drunkEffect, request.alcohol ? now : null, drunkUntil,
    drunkEffect, rampageGoalMl, drunkEffect, rampageGoalMl, drunkEffect, JSON.stringify(rampagePlayerIds),
    drunkEffect, MARATHON_DRUNK_DURATION_MS,
    request.expectedRevision, now - MARATHON.minWaterIntervalMs, notResting, now, context.member.id,
    request.alcohol ? 1 : 0, now, context.member.id,
    context.member.id, japanDate, MARATHON.dailyWaterLimit, context.sessionHash, now,
    context.member.id, MARATHON.gameId, context.member.id, request.requestId)];

  if (trapTriggered) {
    statements.push(database.prepare(`
      UPDATE marathon_shop_inventory SET pending_trap_count=pending_trap_count-1
      WHERE player_id=(SELECT player_id FROM marathon_shop_inventory
        WHERE pending_trap_count>0 AND player_id<>? ORDER BY player_id LIMIT 1)
        AND pending_trap_count>0
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(context.member.id, writeToken));
  }

  if (didSteal && leader) {
    statements.push(database.prepare(`
      UPDATE mini_game_scores SET score=score-?,achieved_at=?
      WHERE game_id=? AND player_id=? AND score>=? AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(amountMl, now, MARATHON.gameId, leader.playerId, amountMl, writeToken));
  }
  if (leaderGuardBlocked && leader) {
    statements.push(database.prepare(`
      UPDATE marathon_shop_inventory SET steal_guard_charges=steal_guard_charges-1
      WHERE player_id=? AND steal_guard_charges>0
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(leader.playerId, writeToken));
  } else if (leaderCountered && leader) {
    statements.push(database.prepare(`
      UPDATE marathon_shop_inventory SET steal_counter_charges=steal_counter_charges-1
      WHERE player_id=? AND steal_counter_charges>0
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(leader.playerId, writeToken));
  }
  if (request.alcohol) {
    statements.push(database.prepare(`
      UPDATE marathon_shop_inventory SET alcohol_count=alcohol_count-1
      WHERE player_id=? AND alcohol_count>0
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(context.member.id, writeToken));
  }
  statements.push(database.prepare(`
    INSERT INTO mini_game_scores(game_id,player_id,score,achieved_at)
    SELECT ?,?,MAX(0,?),? FROM marathon_state WHERE id=1 AND write_token=?
    ON CONFLICT(game_id,player_id) DO UPDATE SET score=MAX(0,mini_game_scores.score+?),achieved_at=excluded.achieved_at
  `).bind(MARATHON.gameId, context.member.id, amountMl, now, writeToken, amountMl));
  if (drunkEffect === "rampage") {
    const count = rampagePlayerIds.length;
    for (let index = 0; index < count; index++) {
      const shareMl = Math.floor(rampageGoalMl * (index + 1) / count)
        - Math.floor(rampageGoalMl * index / count);
      const playerId = rampagePlayerIds[index];
      if (shareMl <= 0 || !playerId) continue;
      statements.push(database.prepare(`
        INSERT INTO mini_game_scores(game_id,player_id,score,achieved_at)
        SELECT ?,?,?,? FROM marathon_state WHERE id=1 AND write_token=?
        ON CONFLICT(game_id,player_id) DO UPDATE SET
          score=mini_game_scores.score+excluded.score,achieved_at=excluded.achieved_at
      `).bind(MARATHON.gameId, playerId, shareMl, now, writeToken));
    }
  }
  statements.push(database.prepare(`
    INSERT INTO marathon_giver_limits(player_id,japan_date,water_count,steal_count)
    SELECT ?,?,1,0 FROM marathon_state WHERE id=1 AND write_token=?
    ON CONFLICT(player_id) DO UPDATE SET
      water_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.water_count+1 ELSE 1 END,
      steal_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.steal_count ELSE 0 END,
      japan_date=excluded.japan_date
  `).bind(context.member.id, japanDate, writeToken));
  statements.push(database.prepare(`
    INSERT INTO mini_game_runs(game_id,player_id,run_id,turn,balance,status,last_request_id,result_json,started_at,updated_at)
    SELECT ?,?,?,revision,?,'finished',?,?,?,? FROM marathon_state WHERE id=1 AND write_token=?
    ON CONFLICT(game_id,player_id) DO UPDATE SET run_id=excluded.run_id,turn=excluded.turn,balance=excluded.balance,
      status='finished',last_request_id=excluded.last_request_id,result_json=excluded.result_json,
      started_at=excluded.started_at,updated_at=excluded.updated_at
  `).bind(MARATHON.gameId, context.member.id, request.requestId, Math.max(0, amountMl),
    request.requestId, JSON.stringify(receipt), now, now, writeToken));
  const batch = await database.batch(statements);
  const fresh = await readMarathonContext(req);
  if (!fresh) return { status: "unauthorized", context: null };
  if (batch[0].meta.changes === 1) return { status: "accepted", context: fresh };
  if (fresh.lastWater?.requestId === request.requestId) return { status: "duplicate", context: fresh };
  return { status: "conflict", context: fresh };
}

export type MarathonStealResult = {
  status: "accepted" | "duplicate" | "conflict" | "daily-limit" | "insufficient" | "no-target" | "unauthorized";
  context: MarathonContext | null;
};

/** Transfer part of the attacker's cumulative water to a higher-ranked player.
 * Steals update the ranking and revision only; Kobayashi's thirst is untouched. */
export async function stealMarathon(req: Request, context: MarathonContext, request: MarathonStealRequest): Promise<MarathonStealResult> {
  if (context.lastSteal?.requestId === request.requestId) return { status: "duplicate", context };
  if (context.state.revision !== request.expectedRevision) return { status: "conflict", context };
  const dailyLimit = MARATHON.dailyStealLimit + context.shop.stealGloveCount;
  if (context.dailyStealCount >= dailyLimit) return { status: "daily-limit", context };

  const ownIndex = context.scores.findIndex((score) => score.playerId === context.member.id);
  const ownScore = ownIndex >= 0 ? context.scores[ownIndex]?.handMl ?? 0 : 0;
  const consumedMl = Math.floor(ownScore * MARATHON.stealFeePercent / 100);
  if (ownScore < MARATHON.stealMinimumScoreMl || consumedMl < 1) return { status: "insufficient", context };

  const targets = getEligibleStealTargets(context.scores, context.member.id, ownIndex);
  if (targets.length === 0) return { status: "no-target", context };
  const target = targets[secureIndex(targets.length)];
  if (!target) return { status: "no-target", context };
  const percent = rollStealPercent();
  const attemptedMl = Math.floor(target.handMl * percent / 100);
  if (attemptedMl < 1) return { status: "no-target", context };
  const blocked = target.guardCharges > 0;
  const countered = !blocked && target.counterCharges > 0;
  const counteredMl = countered ? Math.min(attemptedMl, Math.max(0, ownScore - consumedMl)) : 0;
  const stolenMl = !blocked && !countered ? attemptedMl : 0;

  const now = Date.now();
  const japanDate = marathonJapanDate(now);
  const receipt: MarathonSteal = {
    requestId: request.requestId, stolenAt: now, consumedMl, stolenMl, percent,
    targetPlayerId: target.playerId, targetName: target.name, blocked, countered, counteredMl,
  };
  const writeToken = random();
  const database = db();
  const batch = await database.batch([
    database.prepare(`
      UPDATE marathon_state SET revision=revision+1,total_water_ml=total_water_ml-?,write_token=?
      WHERE id=1 AND revision=? AND total_water_ml>=?
        AND COALESCE((SELECT CASE WHEN japan_date=? THEN steal_count ELSE 0 END
          FROM marathon_giver_limits WHERE player_id=?),0)<?
        AND COALESCE((SELECT score FROM mini_game_scores WHERE game_id=? AND player_id=?),0)>=?
        AND COALESCE((SELECT score FROM mini_game_scores WHERE game_id=? AND player_id=?),0)>=?
        AND EXISTS (SELECT 1 FROM sessions s JOIN member_devices d ON d.hash=s.device_hash
          JOIN players p ON p.id=d.player_id WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
            AND p.id=? AND p.sort_order IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM marathon_giver_limits WHERE player_id=? AND last_steal_request_id=?)
    `).bind(consumedMl, writeToken, request.expectedRevision, consumedMl,
      japanDate, context.member.id, dailyLimit,
      MARATHON.gameId, context.member.id, consumedMl,
      MARATHON.gameId, target.playerId, attemptedMl,
      context.sessionHash, now, context.member.id, context.member.id, request.requestId),
    ...(stolenMl > 0 ? [database.prepare(`
      UPDATE mini_game_scores SET score=score-?,achieved_at=?
      WHERE game_id=? AND player_id=? AND score>=?
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(stolenMl, now, MARATHON.gameId, target.playerId, stolenMl, writeToken)] : []),
    ...(counteredMl > 0 ? [database.prepare(`
      UPDATE mini_game_scores SET score=score+?,achieved_at=?
      WHERE game_id=? AND player_id=?
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(counteredMl, now, MARATHON.gameId, target.playerId, writeToken)] : []),
    database.prepare(`
      UPDATE mini_game_scores SET score=score-?+?-?,achieved_at=?
      WHERE game_id=? AND player_id=? AND score>=?
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(consumedMl, stolenMl, counteredMl, now, MARATHON.gameId, context.member.id, consumedMl + counteredMl, writeToken),
    ...(blocked ? [database.prepare(`
      UPDATE marathon_shop_inventory SET steal_guard_charges=steal_guard_charges-1
      WHERE player_id=? AND steal_guard_charges>0
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(target.playerId, writeToken)] : []),
    ...(countered ? [database.prepare(`
      UPDATE marathon_shop_inventory SET steal_counter_charges=steal_counter_charges-1
      WHERE player_id=? AND steal_counter_charges>0
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(target.playerId, writeToken)] : []),
    database.prepare(`
      INSERT INTO marathon_giver_limits(player_id,japan_date,water_count,steal_count,last_steal_request_id,last_steal_result_json)
      SELECT ?,?,0,1,?,? FROM marathon_state WHERE id=1 AND write_token=?
      ON CONFLICT(player_id) DO UPDATE SET
        water_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.water_count ELSE 0 END,
        steal_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.steal_count+1 ELSE 1 END,
        last_steal_request_id=excluded.last_steal_request_id,
        last_steal_result_json=excluded.last_steal_result_json,
        japan_date=excluded.japan_date
    `).bind(context.member.id, japanDate, request.requestId, JSON.stringify(receipt), writeToken),
    ...(stolenMl > 0 ? [database.prepare(`
      INSERT INTO marathon_giver_limits(player_id,japan_date,water_count,steal_count,
        pending_steal_count,pending_steal_ml,pending_steal_last_giver_name,pending_steal_version)
      SELECT ?,?,0,0,1,?,?,1 FROM marathon_state WHERE id=1 AND write_token=?
      ON CONFLICT(player_id) DO UPDATE SET
        water_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.water_count ELSE 0 END,
        steal_count=CASE WHEN marathon_giver_limits.japan_date=excluded.japan_date THEN marathon_giver_limits.steal_count ELSE 0 END,
        pending_steal_count=marathon_giver_limits.pending_steal_count+1,
        pending_steal_ml=marathon_giver_limits.pending_steal_ml+excluded.pending_steal_ml,
        pending_steal_last_giver_name=excluded.pending_steal_last_giver_name,
        pending_steal_version=marathon_giver_limits.pending_steal_version+1,
        japan_date=excluded.japan_date
    `).bind(target.playerId, japanDate, stolenMl, context.member.name, writeToken)] : []),
  ]);
  const fresh = await readMarathonContext(req);
  if (!fresh) return { status: "unauthorized", context: null };
  if (batch[0].meta.changes === 1) return { status: "accepted", context: fresh };
  if (fresh.lastSteal?.requestId === request.requestId) return { status: "duplicate", context: fresh };
  return { status: "conflict", context: fresh };
}

export type MarathonShopBuyResult = {
  status: "accepted" | "duplicate" | "conflict" | "daily-limit" | "insufficient" | "unavailable" | "unauthorized";
  context: MarathonContext | null;
};

export async function buyMarathonShopItem(
  req: Request,
  context: MarathonContext,
  request: MarathonShopRequest,
): Promise<MarathonShopBuyResult> {
  if (context.lastShopPurchase?.requestId === request.requestId) return { status: "duplicate", context };
  if (context.state.revision !== request.expectedRevision) return { status: "conflict", context };
  const now = Date.now();
  const inventory = context.shop;
  const normalCostMl = marathonShopPrice(request.item, {
    miniKobayashiCount: inventory.miniKobayashiCount,
    stealGuardCharges: inventory.stealGuardCharges,
    stealCounterCharges: inventory.stealCounterCharges,
    stealGloveCount: inventory.stealGloveCount,
    reservoirGodCount: inventory.reservoirGodCount,
  });
  if (context.state.drunkEffect === "generous" && context.state.drunkUntil <= now
    && context.shop.pricesMl[request.item] !== normalCostMl) {
    const fresh = await readMarathonContext(req);
    return { status: fresh ? "conflict" : "unauthorized", context: fresh };
  }
  if ((request.item === "reservoir" && context.shop.reservoirOwned)
    || (request.item === "reservoir-god" && !context.shop.reservoirOwned)) return { status: "unavailable", context };

  const caps: Partial<Record<MarathonShopItem, number>> = {
    "steal-guard": 2, "steal-counter": 1, "poison-trap": 2, alcohol: 3,
  };
  const boughtToday: Partial<Record<MarathonShopItem, number>> = {
    "steal-guard": context.shop.guardPurchasesToday,
    "steal-counter": context.shop.counterPurchasesToday,
    "poison-trap": context.shop.trapPurchasesToday,
    alcohol: context.shop.alcoholPurchasesToday,
  };
  const cap = caps[request.item];
  if (cap !== undefined && (boughtToday[request.item] ?? 0) >= cap) return { status: "daily-limit", context };

  const costMl = context.shop.pricesMl[request.item];
  if (context.shop.walletMl < costMl) return { status: "insufficient", context };
  const japanDate = marathonJapanDate(now);
  const discounted = context.state.drunkEffect === "generous" && context.state.drunkUntil > now;
  if (discounted && costMl !== Math.floor(normalCostMl * 0.8)) return { status: "conflict", context };
  const handSpentMl = Math.min(context.shop.handMl, costMl);
  const reservoirSpentMl = costMl - handSpentMl;
  const purchase: MarathonShopPurchase = { requestId: request.requestId, item: request.item, costMl, purchasedAt: now };
  const guardPurchases = (inventory.guardPurchasesToday) + (request.item === "steal-guard" ? 1 : 0);
  const counterPurchases = (inventory.counterPurchasesToday) + (request.item === "steal-counter" ? 1 : 0);
  const trapPurchases = (inventory.trapPurchasesToday) + (request.item === "poison-trap" ? 1 : 0);
  const alcoholPurchases = inventory.alcoholPurchasesToday + (request.item === "alcohol" ? 1 : 0);
  const nextInventory = {
    miniKobayashiCount: inventory.miniKobayashiCount + (request.item === "mini-kobayashi" ? 1 : 0),
    stealGuardCharges: inventory.stealGuardCharges + (request.item === "steal-guard" ? 3 : 0),
    stealCounterCharges: inventory.stealCounterCharges + (request.item === "steal-counter" ? 1 : 0),
    stealGloveCount: inventory.stealGloveCount + (request.item === "steal-glove" ? 1 : 0),
    pendingTrapCount: inventory.pendingTrapCount + (request.item === "poison-trap" ? 1 : 0),
    reservoirOwned: inventory.reservoirOwned || request.item === "reservoir",
    reservoirMl: inventory.reservoirMl - reservoirSpentMl,
    reservoirGrowthJapanDate: japanDate,
    reservoirLastDepositAt: inventory.reservoirLastDepositAt,
    reservoirGodCount: inventory.reservoirGodCount + (request.item === "reservoir-god" ? 1 : 0),
    alcoholCount: inventory.alcoholCount + (request.item === "alcohol" ? 1 : 0),
    alcoholPurchases,
  };
  const writeToken = random();
  const database = db();
  const statements = [database.prepare(`
    UPDATE marathon_state SET revision=revision+1,write_token=?
    WHERE id=1 AND revision=?
      AND COALESCE((SELECT score FROM mini_game_scores WHERE game_id=? AND player_id=?),0)>=?
      AND COALESCE((SELECT last_purchase_request_id FROM marathon_shop_inventory WHERE player_id=?),'')<>?
      AND (?<>'reservoir' OR COALESCE((SELECT reservoir_owned FROM marathon_shop_inventory WHERE player_id=?),0)=0)
      AND (?<>'reservoir-god' OR COALESCE((SELECT reservoir_owned FROM marathon_shop_inventory WHERE player_id=?),0)=1)
      AND EXISTS (SELECT 1 FROM sessions s JOIN member_devices d ON d.hash=s.device_hash
        JOIN players p ON p.id=d.player_id WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
          AND p.id=? AND p.sort_order IS NOT NULL)
      AND (?<0 OR COALESCE((SELECT CASE WHEN japan_date=? THEN guard_purchases ELSE 0 END
        FROM marathon_shop_inventory WHERE player_id=?),0)<?)
      AND (?<0 OR COALESCE((SELECT CASE WHEN japan_date=? THEN counter_purchases ELSE 0 END
        FROM marathon_shop_inventory WHERE player_id=?),0)<?)
      AND (?<0 OR COALESCE((SELECT CASE WHEN japan_date=? THEN trap_purchases ELSE 0 END
        FROM marathon_shop_inventory WHERE player_id=?),0)<?)
      AND (?<0 OR COALESCE((SELECT CASE WHEN japan_date=? THEN alcohol_purchases ELSE 0 END
        FROM marathon_shop_inventory WHERE player_id=?),0)<?)
      AND (?=0 OR EXISTS (SELECT 1 FROM marathon_state
        WHERE id=1 AND drunk_effect='generous' AND drunk_until>?))
  `).bind(writeToken, request.expectedRevision, MARATHON.gameId, context.member.id, handSpentMl,
    context.member.id, request.requestId, request.item, context.member.id, request.item, context.member.id,
    context.sessionHash, now, context.member.id,
    request.item === "steal-guard" ? guardPurchases - 1 : -1, japanDate, context.member.id, 2,
    request.item === "steal-counter" ? counterPurchases - 1 : -1, japanDate, context.member.id, 1,
    request.item === "poison-trap" ? trapPurchases - 1 : -1, japanDate, context.member.id, 2,
    request.item === "alcohol" ? alcoholPurchases - 1 : -1, japanDate, context.member.id, 3,
    discounted ? 1 : 0, now),
    database.prepare(`
      UPDATE mini_game_scores SET score=score-?,achieved_at=?
      WHERE game_id=? AND player_id=? AND score>=?
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(handSpentMl, now, MARATHON.gameId, context.member.id, handSpentMl, writeToken),
    database.prepare(`
      INSERT INTO marathon_shop_inventory(player_id,mini_kobayashi_count,steal_guard_charges,
        steal_counter_charges,steal_glove_count,pending_trap_count,reservoir_owned,reservoir_ml,
        reservoir_growth_japan_date,reservoir_last_deposit_at,reservoir_god_count,alcohol_count,alcohol_purchases,japan_date,
        guard_purchases,counter_purchases,trap_purchases,last_purchase_request_id,last_purchase_result_json)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM marathon_state WHERE id=1 AND write_token=?
      ON CONFLICT(player_id) DO UPDATE SET
        mini_kobayashi_count=excluded.mini_kobayashi_count,
        steal_guard_charges=excluded.steal_guard_charges,
        steal_counter_charges=excluded.steal_counter_charges,
        steal_glove_count=excluded.steal_glove_count,
        pending_trap_count=excluded.pending_trap_count,
        reservoir_owned=excluded.reservoir_owned,
        reservoir_ml=excluded.reservoir_ml,
        reservoir_growth_japan_date=excluded.reservoir_growth_japan_date,
        reservoir_last_deposit_at=excluded.reservoir_last_deposit_at,
        reservoir_god_count=excluded.reservoir_god_count,
        alcohol_count=excluded.alcohol_count,
        alcohol_purchases=excluded.alcohol_purchases,
        japan_date=excluded.japan_date,
        guard_purchases=excluded.guard_purchases,
        counter_purchases=excluded.counter_purchases,
        trap_purchases=excluded.trap_purchases,
        last_purchase_request_id=excluded.last_purchase_request_id,
        last_purchase_result_json=excluded.last_purchase_result_json
    `).bind(context.member.id, nextInventory.miniKobayashiCount, nextInventory.stealGuardCharges,
      nextInventory.stealCounterCharges, nextInventory.stealGloveCount, nextInventory.pendingTrapCount,
      Number(nextInventory.reservoirOwned), nextInventory.reservoirMl, nextInventory.reservoirGrowthJapanDate,
      nextInventory.reservoirLastDepositAt, nextInventory.reservoirGodCount,
      nextInventory.alcoholCount, nextInventory.alcoholPurchases, japanDate,
      guardPurchases, counterPurchases, trapPurchases, request.requestId, JSON.stringify(purchase), writeToken),
  ];
  if (request.item === "poison-trap") {
    statements.push(database.prepare(`
      UPDATE marathon_state SET pending_trap_count=pending_trap_count+1
      WHERE id=1 AND write_token=?
    `).bind(writeToken));
  }
  const batch = await database.batch(statements);
  const fresh = await readMarathonContext(req);
  if (!fresh) return { status: "unauthorized", context: null };
  if (batch[0].meta.changes === 1) return { status: "accepted", context: fresh };
  if (fresh.lastShopPurchase?.requestId === request.requestId) return { status: "duplicate", context: fresh };
  if (fresh.state.revision === request.expectedRevision) {
    if ((request.item === "reservoir" && fresh.shop.reservoirOwned)
      || (request.item === "reservoir-god" && !fresh.shop.reservoirOwned)) return { status: "unavailable", context: fresh };
    if (fresh.shop.walletMl < fresh.shop.pricesMl[request.item]) return { status: "insufficient", context: fresh };
    if (cap !== undefined && (boughtToday[request.item] ?? 0) >= cap) return { status: "daily-limit", context: fresh };
  }
  return { status: "conflict", context: fresh };
}

export type MarathonReservoirDepositResult = {
  status: "accepted" | "conflict" | "cooldown" | "insufficient" | "unavailable" | "unauthorized";
  context: MarathonContext | null;
};

export async function depositMarathonReservoir(
  req: Request,
  context: MarathonContext,
  request: MarathonReservoirDepositRequest,
): Promise<MarathonReservoirDepositResult> {
  if (context.state.revision !== request.expectedRevision) return { status: "conflict", context };
  if (!context.shop.reservoirOwned) return { status: "unavailable", context };
  if (context.shop.reservoirNextDepositAt !== null && Date.now() < context.shop.reservoirNextDepositAt) {
    return { status: "cooldown", context };
  }
  if (request.amountMl > context.shop.handMl) return { status: "insufficient", context };

  const now = Date.now();
  const japanDate = marathonJapanDate(now);
  const cutoff = now - MARATHON.reservoirDepositIntervalMs;
  const nextReservoirMl = Math.min(Number.MAX_SAFE_INTEGER, context.shop.reservoirMl + request.amountMl);
  const writeToken = random();
  const database = db();
  const batch = await database.batch([
    database.prepare(`
      UPDATE marathon_state SET revision=revision+1,write_token=?
      WHERE id=1 AND revision=?
        AND COALESCE((SELECT score FROM mini_game_scores WHERE game_id=? AND player_id=?),0)>=?
        AND EXISTS (SELECT 1 FROM marathon_shop_inventory WHERE player_id=? AND reservoir_owned=1
          AND (reservoir_last_deposit_at IS NULL OR reservoir_last_deposit_at<=?))
        AND EXISTS (SELECT 1 FROM sessions s JOIN member_devices d ON d.hash=s.device_hash
          JOIN players p ON p.id=d.player_id WHERE s.hash=? AND (s.expires=0 OR s.expires>?)
            AND p.id=? AND p.sort_order IS NOT NULL)
    `).bind(writeToken, request.expectedRevision, MARATHON.gameId, context.member.id, request.amountMl,
      context.member.id, cutoff, context.sessionHash, now, context.member.id),
    database.prepare(`
      UPDATE mini_game_scores SET score=score-?,achieved_at=?
      WHERE game_id=? AND player_id=? AND score>=?
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(request.amountMl, now, MARATHON.gameId, context.member.id, request.amountMl, writeToken),
    database.prepare(`
      UPDATE marathon_shop_inventory SET reservoir_ml=?,reservoir_growth_japan_date=?,reservoir_last_deposit_at=?
      WHERE player_id=? AND reservoir_owned=1
        AND EXISTS (SELECT 1 FROM marathon_state WHERE id=1 AND write_token=?)
    `).bind(nextReservoirMl, japanDate, now, context.member.id, writeToken),
  ]);
  const fresh = await readMarathonContext(req);
  if (!fresh) return { status: "unauthorized", context: null };
  if (batch[0].meta.changes === 1) return { status: "accepted", context: fresh };
  if (fresh.state.revision !== request.expectedRevision) return { status: "conflict", context: fresh };
  if (!fresh.shop.reservoirOwned) return { status: "unavailable", context: fresh };
  if (fresh.shop.reservoirNextDepositAt !== null && Date.now() < fresh.shop.reservoirNextDepositAt) {
    return { status: "cooldown", context: fresh };
  }
  if (request.amountMl > fresh.shop.handMl) return { status: "insufficient", context: fresh };
  return { status: "conflict", context: fresh };
}

export async function acknowledgeMarathonStealNotification(
  req: Request,
  context: MarathonContext,
  version: number,
): Promise<{ acknowledged: boolean; context: MarathonContext | null }> {
  const now = Date.now();
  const result = await db().prepare(`
    UPDATE marathon_giver_limits
    SET pending_steal_count=0,pending_steal_ml=0,pending_steal_last_giver_name=NULL
    WHERE player_id=? AND pending_steal_version=? AND pending_steal_count>0
      AND EXISTS (SELECT 1 FROM sessions s JOIN member_devices d ON d.hash=s.device_hash
        WHERE s.hash=? AND (s.expires=0 OR s.expires>?) AND d.player_id=?)
  `).bind(context.member.id, version, context.sessionHash, now, context.member.id).run();
  const fresh = await readMarathonContext(req);
  return { acknowledged: (result.meta.changes ?? 0) > 0, context: fresh };
}
