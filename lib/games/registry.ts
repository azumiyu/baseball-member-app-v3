import { INITIAL_BANKROLL, MAX_TURNS, resolveTurn, type TurnResult } from "./chinchiro";
import { randomRelease, resolvePitch } from "./fastball";

/** Server-only play adapters. The catalog controls presentation; each adapter
 * owns its game's rules, score and completion condition.
 */
type GameEngine = {
  kind: "chinchiro";
  initialBalance: number;
  maxTurns: number;
  play: (balance: number, bet: number, random: () => number) => TurnResult;
} | { kind: "fastball"; initialBalance: number; maxTurns: number; prepare: typeof randomRelease; play: typeof resolvePitch };

const engines: Record<string, GameEngine> = {
  "kawataka-chinchiro": { kind: "chinchiro", initialBalance: INITIAL_BANKROLL, maxTurns: MAX_TURNS, play: resolveTurn },
  "oshino-fastball": { kind: "fastball", initialBalance: 0, maxTurns: 1, prepare: randomRelease, play: resolvePitch },
};

export function gameEngine(id: string): GameEngine | undefined {
  return Object.hasOwn(engines, id) ? engines[id] : undefined;
}
