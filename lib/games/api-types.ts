import type { AuthMember } from "../auth-types";
import type { TurnResult } from "./chinchiro";
import type { FastballResult } from "./fastball";
import type { BetType, HorseRaceState } from "./horse-racing";

export type FastballReady = { kind: "fastball-ready"; releaseMs: number };
export type FastballRunResult = FastballReady | FastballResult;
export type GameResult = TurnResult | FastballRunResult | HorseRaceState;

export type GameRun<TResult = TurnResult> = {
  id: string;
  gameId: string;
  turn: number;
  balance: number;
  status: "playing" | "finished";
  lastRequestId: string;
  lastResult: TResult | null;
};

export type LeaderboardEntry = {
  rank: number;
  playerId: string;
  name: string;
  number: string;
  score: number;
  achievedAt: number;
};

export type GameSnapshot<TResult = TurnResult> = {
  member: AuthMember;
  gameId: string;
  run: GameRun<TResult> | null;
  leaderboard: LeaderboardEntry[];
  personalBest: LeaderboardEntry | null;
};

export type StartGameRequest = {
  action: "start";
  gameId: string;
  requestId: string;
  runId: string | null;
  turn: number;
};

export type PlayTurnRequest = {
  action: "turn";
  gameId: string;
  requestId: string;
  runId: string;
  turn: number;
  bet: number;
};

export type PitchRequest = {
  action: "pitch";
  gameId: string;
  requestId: string;
  runId: string;
  turn: number;
  elapsedMs: number;
};

export type HorseBuyRequest = {
  action: "horse-buy";
  gameId: string;
  requestId: string;
  runId: string;
  turn: number;
  type: BetType;
  selection: number[];
  amount: number;
};

export type HorseRaceRequest = {
  action: "horse-race" | "horse-next";
  gameId: string;
  requestId: string;
  runId: string;
  turn: number;
};

export type GameRequest = StartGameRequest | PlayTurnRequest | PitchRequest | HorseBuyRequest | HorseRaceRequest;
