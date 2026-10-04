import { INITIAL_BANKROLL, MAX_TURNS, resolveTurn, type TurnResult } from "./chinchiro";
import { randomRelease, resolvePitch } from "./fastball";
import { INITIAL_BALANCE, createRace, purchaseTicket, resolveRace } from "./horse-racing";
import { prepareBench, resolveBenchSwing } from "./horie-bench";
import { resolveRamen, type RamenReady } from "./ramen";

/** Server-only play adapters. The catalog controls presentation; each adapter
 * owns its game's rules, score and completion condition.
 */
type GameEngine = {
  kind: "chinchiro";
  initialBalance: number;
  maxTurns: number;
  play: (balance: number, bet: number, random: () => number) => TurnResult;
} | { kind: "fastball"; initialBalance: number; maxTurns: number; prepare: typeof randomRelease; play: typeof resolvePitch }
  | { kind: "horse-racing"; initialBalance: number; maxTurns: number; prepare: typeof createRace; buy: typeof purchaseTicket; play: typeof resolveRace }
  | { kind: "bench"; initialBalance: number; maxTurns: number; prepare: typeof prepareBench; play: typeof resolveBenchSwing }
  | { kind: "ramen"; initialBalance: number; maxTurns: number; prepare: (now: number) => RamenReady; play: typeof resolveRamen };

const engines: Record<string, GameEngine> = {
  "negishi-ramen": { kind: "ramen", initialBalance: 0, maxTurns: 1, prepare: (preparedAt) => ({ kind: "ramen-ready", preparedAt }), play: resolveRamen },
  "horie-bench-breaker": { kind: "bench", initialBalance: 0, maxTurns: 1, prepare: prepareBench, play: resolveBenchSwing },
  "kawataka-chinchiro": { kind: "chinchiro", initialBalance: INITIAL_BANKROLL, maxTurns: MAX_TURNS, play: resolveTurn },
  "oshino-fastball": { kind: "fastball", initialBalance: 0, maxTurns: 1, prepare: randomRelease, play: resolvePitch },
  "nagayasu-horse-racing": { kind: "horse-racing", initialBalance: INITIAL_BALANCE, maxTurns: Number.MAX_SAFE_INTEGER, prepare: createRace, buy: purchaseTicket, play: resolveRace },
};

export function gameEngine(id: string): GameEngine | undefined {
  return Object.hasOwn(engines, id) ? engines[id] : undefined;
}
