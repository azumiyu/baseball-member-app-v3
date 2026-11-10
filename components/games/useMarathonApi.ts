"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createEntityId } from "@/lib/entity-id";
import type { MarathonShopItem, MarathonSnapshot } from "@/lib/games/marathon";

type WaterRequest = { requestId: string; expectedRevision: number };
type MarathonResponse = MarathonSnapshot & {
  error?: string;
  snapshot?: MarathonSnapshot;
};

/** The shared runner advances locally. The API handles visits, refreshes, water, steals, and notifications. */
export function useMarathonApi() {
  const [snapshot, setSnapshot] = useState<MarathonSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const [stealRetryPending, setStealRetryPending] = useState(false);
  const [shopRetryPending, setShopRetryPending] = useState(false);
  const alive = useRef(false);
  const current = useRef<MarathonSnapshot | null>(null);
  const pending = useRef<WaterRequest | null>(null);
  const pendingSteal = useRef<WaterRequest | null>(null);
  const pendingShop = useRef<(WaterRequest & { item: MarathonShopItem }) | null>(null);
  const reading = useRef<number | null>(null);
  const readSequence = useRef(0);
  const mutating = useRef(false);
  const lastRead = useRef(0);
  const clock = useRef({ server: 0, local: 0 });

  const accept = useCallback((value: MarathonSnapshot) => {
    if (!alive.current) return;
    if (current.current && value.state.revision < current.current.state.revision) return;
    const previousNow = clock.current.server + Math.max(0, performance.now() - clock.current.local);
    current.current = value;
    clock.current = { server: Math.max(value.serverNow, previousNow), local: performance.now() };
    lastRead.current = performance.now();
    setSnapshot(value);
    setUnauthorized(false);
  }, []);

  const now = useCallback(() => {
    const anchor = clock.current;
    return anchor.server + Math.max(0, performance.now() - anchor.local);
  }, []);

  const read = useCallback(async (signal?: AbortSignal) => {
    if (reading.current || mutating.current) return null;
    const readId = ++readSequence.current;
    reading.current = readId;
    if (alive.current) setRefreshing(true);
    try {
      const response = await fetch("/api/games/marathon", { cache: "no-store", signal });
      const value = await response.json() as MarathonResponse;
      if (signal?.aborted || reading.current !== readId) return null;
      if (response.status === 401) {
        if (alive.current) setUnauthorized(true);
        return null;
      }
      if (!response.ok) throw new Error(value.error || "給水所の様子を読み込めませんでした。");
      accept(value);
      if (alive.current) setError("");
      return value;
    } catch (cause) {
      if (!signal?.aborted && alive.current) {
        setError(cause instanceof Error ? cause.message : "通信できませんでした。");
      }
      return null;
    } finally {
      if (reading.current === readId) reading.current = null;
      if (alive.current && !signal?.aborted && readSequence.current === readId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [accept]);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    // Start the external read on entry. No timer polls the shared runner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void read(controller.signal);
    const onVisibility = () => {
      if (!document.hidden && performance.now() - lastRead.current >= 60_000) {
        void read();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive.current = false;
      controller.abort();
      // Allow a fresh entry read if React remounts effects in development.
      readSequence.current += 1;
      reading.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [read]);

  const water = useCallback(async (): Promise<MarathonSnapshot | null> => {
    if (mutating.current || reading.current || !current.current) return null;
    const request = pending.current ?? {
      requestId: createEntityId(),
      expectedRevision: current.current.state.revision,
    };
    pending.current = request;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/games/marathon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const value = await response.json() as MarathonResponse;
      if (response.status === 401) {
        pending.current = null;
        if (alive.current) setUnauthorized(true);
        return null;
      }
      if (response.status === 409) {
        pending.current = null;
        if (value.snapshot) accept(value.snapshot);
        if (alive.current) setError(value.error || "ほかの人が先に給水しました。いまの様子に更新しました。");
        return null;
      }
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) pending.current = null;
        throw new Error(value.error || "給水を確認できませんでした。同じ給水を再試行してください。");
      }
      pending.current = null;
      accept(value);
      return alive.current ? value : null;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "通信できませんでした。同じ給水を再試行してください。");
      return null;
    } finally {
      mutating.current = false;
      if (alive.current) {
        setBusy(false);
        setRetryPending(Boolean(pending.current));
      }
    }
  }, [accept]);

  const steal = useCallback(async (): Promise<MarathonSnapshot | null> => {
    if (mutating.current || reading.current || !current.current) return null;
    const request = pendingSteal.current ?? {
      requestId: createEntityId(),
      expectedRevision: current.current.state.revision,
    };
    pendingSteal.current = request;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/games/marathon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "steal", ...request }),
      });
      const value = await response.json() as MarathonResponse;
      if (response.status === 401) {
        pendingSteal.current = null;
        if (alive.current) setUnauthorized(true);
        return null;
      }
      if (response.status === 409) {
        pendingSteal.current = null;
        if (value.snapshot) accept(value.snapshot);
        if (alive.current) setError(value.error || "強奪できませんでした。最新の状態を読み込みました。");
        return null;
      }
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) pendingSteal.current = null;
        throw new Error(value.error || "強奪の結果を確認できませんでした。同じ操作を再試行してください。");
      }
      pendingSteal.current = null;
      accept(value);
      return alive.current ? value : null;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "通信できませんでした。同じ強奪を再試行してください。");
      return null;
    } finally {
      mutating.current = false;
      if (alive.current) {
        setBusy(false);
        setStealRetryPending(Boolean(pendingSteal.current));
      }
    }
  }, [accept]);

  const shopBuy = useCallback(async (item: MarathonShopItem): Promise<MarathonSnapshot | null> => {
    if (mutating.current || reading.current || !current.current) return null;
    const request = pendingShop.current ?? {
      requestId: createEntityId(),
      expectedRevision: current.current.state.revision,
      item,
    };
    pendingShop.current = request;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/games/marathon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shop-buy", ...request }),
      });
      const value = await response.json() as MarathonResponse;
      if (response.status === 401) {
        pendingShop.current = null;
        if (alive.current) setUnauthorized(true);
        return null;
      }
      if (response.status === 409) {
        pendingShop.current = null;
        if (value.snapshot) accept(value.snapshot);
        if (alive.current) setError(value.error || "購入できませんでした。最新の残高を読み込みました。");
        return null;
      }
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) pendingShop.current = null;
        throw new Error(value.error || "購入結果を確認できませんでした。同じ購入を再試行してください。");
      }
      pendingShop.current = null;
      accept(value);
      return alive.current ? value : null;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "通信できませんでした。同じ購入を再試行してください。");
      return null;
    } finally {
      mutating.current = false;
      if (alive.current) {
        setBusy(false);
        setShopRetryPending(Boolean(pendingShop.current));
      }
    }
  }, [accept]);

  const acknowledgeStealNotification = useCallback(async (version: number): Promise<MarathonSnapshot | null> => {
    if (mutating.current || reading.current || !current.current) return null;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/games/marathon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge-steal-notification", version }),
      });
      const value = await response.json() as MarathonResponse;
      if (response.status === 401) {
        if (alive.current) setUnauthorized(true);
        return null;
      }
      if (!response.ok) throw new Error(value.error || "強奪通知を確認できませんでした。");
      accept(value);
      return alive.current ? value : null;
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "通信できませんでした。通知を再確認してください。");
      return null;
    } finally {
      mutating.current = false;
      if (alive.current) setBusy(false);
    }
  }, [accept]);

  return { snapshot, loading, refreshing, busy, error, unauthorized, retryPending, stealRetryPending, shopRetryPending, read, water, steal, shopBuy, acknowledgeStealNotification, now };
}
