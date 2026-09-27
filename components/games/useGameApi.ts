"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameRequest, GameSnapshot } from "@/lib/games/api-types";
import type { TurnResult } from "@/lib/games/chinchiro";

export type GameAction = GameRequest;

/** No polling: read on entry and update only when the player takes an action. */
export function useGameApi<TResult = TurnResult>(gameId: string) {
  const [snapshot, setSnapshot] = useState<GameSnapshot<TResult> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const pending = useRef<GameAction | null>(null);
  const mutationBusy = useRef(false);
  const alive = useRef(false);

  const read = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/games?game=${encodeURIComponent(gameId)}`, { cache: "no-store", signal });
      const value = await response.json() as GameSnapshot<TResult> & { error?: string };
      if (response.status === 401) {
        if (alive.current) setUnauthorized(true);
        return null;
      }
      if (!response.ok) throw new Error(value.error || "ゲームを読み込めませんでした。");
      if (alive.current) {
        setSnapshot(value);
        setUnauthorized(false);
        setError("");
      }
      return alive.current ? value : null;
    } catch (cause) {
      if (signal?.aborted) return null;
      if (alive.current) setError(cause instanceof Error ? cause.message : "ゲームを読み込めませんでした。");
      return null;
    } finally {
      if (alive.current && !signal?.aborted) setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    // Start the external request on mount; state updates follow its response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read(controller.signal);
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [read]);

  async function act(action?: GameAction): Promise<GameSnapshot<TResult> | null> {
    if (mutationBusy.current) return null;
    // A failed request keeps its ID, so retrying cannot charge a second stake.
    const request = pending.current || action;
    if (!request) return null;
    pending.current = request;
    mutationBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const value = await response.json() as GameSnapshot<TResult> & { error?: string };
      if (response.status === 401) {
        if (alive.current) setUnauthorized(true);
        return null;
      }
      if (response.status === 409) {
        pending.current = null;
        return await read();
      }
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) pending.current = null;
        throw new Error(value.error || "結果を保存できませんでした。もう一度お試しください。");
      }
      pending.current = null;
      if (alive.current) {
        setSnapshot(value);
        setUnauthorized(false);
      }
      return alive.current ? value : null;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "通信できませんでした。同じ操作を再試行できます。");
      return null;
    } finally {
      mutationBusy.current = false;
      if (alive.current) {
        setBusy(false);
        setRetryPending(Boolean(pending.current));
      }
    }
  }

  return { snapshot, loading, busy, error, unauthorized, retryPending, read, act };
}
