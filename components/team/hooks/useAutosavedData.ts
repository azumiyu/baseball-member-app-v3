"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ApiError } from "../lib/api";
import { AUTOSAVE_DELAY_MS } from "../lib/sync-config";
import type { SaveState } from "../types";

export type DataSnapshot<T> = { data: T; revision: number };

export interface AutosavedDataSource<T> {
  initialData: () => T;
  load: () => Promise<DataSnapshot<T>>;
  save: (data: T, revision: number, savedJson: string) => Promise<{ revision: number; data?: T }>;
  acceptSavedData?: boolean;
  loadError: string;
}

/** Keep the source at module scope so re-renders never trigger another load. */
export function useAutosavedData<T extends object>(source: AutosavedDataSource<T>) {
  const [data, setData] = useState<T>(source.initialData);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const saved = useRef("");
  const saving = useRef(false);
  const currentDraft = useRef("");
  const syncVersion = useRef(0);
  useLayoutEffect(() => {
    currentDraft.current = JSON.stringify(data);
  }, [data]);

  const load = useCallback(async () => {
    syncVersion.current += 1;
    setLoading(true);
    setError("");
    try {
      const result = await source.load();
      setData(result.data);
      setRevision(result.revision);
      saved.current = JSON.stringify(result.data);
      setSaveState("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : source.loadError);
    } finally {
      setLoading(false);
    }
  }, [source]);

  /** 自動取得中に始まった編集を上書きせず、表示を維持したまま更新する。 */
  const refreshIfIdle = useCallback(async () => {
    if (saving.current || currentDraft.current !== saved.current) return;
    const version = syncVersion.current;
    try {
      const result = await source.load();
      if (version !== syncVersion.current || saving.current || currentDraft.current !== saved.current) return;
      syncVersion.current += 1;
      saved.current = JSON.stringify(result.data);
      currentDraft.current = saved.current;
      setData(result.data);
      setRevision(result.revision);
    } catch {
      // 通信失敗時は現在の表示と編集内容を保持する。
    }
  }, [source]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const edit = useCallback((updater: T | ((current: T) => T)) => {
    syncVersion.current += 1;
    setData((current) =>
      typeof updater === "function" ? updater(structuredClone(current)) : updater,
    );
    // A conflict needs an explicit reload; further edits must not overwrite it.
    setSaveState((current) => current === "conflict" ? current : "dirty");
  }, []);

  useEffect(() => {
    if (loading || saveState !== "dirty" || saving.current || JSON.stringify(data) === saved.current) return;

    const timer = window.setTimeout(async () => {
      const payload = JSON.stringify(data);
      syncVersion.current += 1;
      saving.current = true;
      setSaveState("saving");
      try {
        const result = await source.save(data, revision, saved.current);
        const unchanged = currentDraft.current === payload;
        if (source.acceptSavedData && result.data && unchanged) {
          saved.current = JSON.stringify(result.data);
          currentDraft.current = saved.current;
          setData(result.data);
        } else {
          saved.current = payload;
        }
        setRevision(result.revision);
        // Edits made during the request remain dirty and get a later save.
        setSaveState(unchanged ? "saved" : "dirty");
        setError("");
      } catch (cause) {
        const failure = cause as ApiError;
        setError(failure.message);
        setSaveState(failure.status === 409 ? "conflict" : "error");
      } finally {
        saving.current = false;
      }
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [data, revision, saveState, loading, source]);

  useEffect(() => {
    if (saveState === "dirty" && !saving.current && JSON.stringify(data) === saved.current) {
      setSaveState("saved");
    }
  }, [data, revision, saveState]);

  return { data, revision, loading, error, setError, saveState, edit, load, refreshIfIdle };
}
