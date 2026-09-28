"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initialScheduleData, validateScheduleData, type ScheduleData, type ScheduleGame } from "@/lib/schedule";
import { api, type ApiError } from "../lib/api";
import { AUTOSAVE_DELAY_MS } from "../lib/sync-config";
import type { SaveState } from "../types";

const API_ERROR = "スケジュールを処理できませんでした。";
const PAGE_CONFLICT = "スケジュールが更新されています。編集中の内容を確認して、最新データを再読み込みしてください。";
type Cursor = { date: string; id: string };
type ScheduleSnapshot = { data: ScheduleData; revision: number; hasMore?: boolean; nextCursor?: Cursor | null };

function validatedSnapshot(snapshot: ScheduleSnapshot): ScheduleSnapshot {
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error(API_ERROR);
  return { ...snapshot, data: validateScheduleData(snapshot.data) };
}

function differences(previous: ScheduleData, next: ScheduleData) {
  const before = new Map(previous.games.map((game) => [game.id, game]));
  const after = new Set(next.games.map((game) => game.id));
  return {
    games: next.games.filter((game) => JSON.stringify(before.get(game.id)) !== JSON.stringify(game)),
    removedGames: previous.games.filter((game) => !after.has(game.id)).map((game) => game.id),
  };
}

function hasDifferences(previous: ScheduleData, next: ScheduleData): boolean {
  const changes = differences(previous, next);
  return changes.games.length > 0 || changes.removedGames.length > 0;
}

function replaceGames(data: ScheduleData, games: ScheduleGame[], removedIds: string[] = []): ScheduleData {
  const removed = new Set(removedIds);
  const result = new Map(data.games.filter((game) => !removed.has(game.id)).map((game) => [game.id, game]));
  for (const game of games) result.set(game.id, game);
  return { games: [...result.values()] };
}

/** Keep server-assigned revisions while replaying edits made during a save. */
function mergeFollowingEdits(sent: ScheduleGame, current: ScheduleGame, canonical: ScheduleGame): ScheduleGame {
  const next = structuredClone(canonical);
  for (const key of ["date", "startTime", "endTime", "title", "opponent", "location", "mapUrl"] as const) {
    if (sent[key] !== current[key]) next[key] = current[key];
  }
  if (sent.status !== current.status) next.status = current.status;
  if (sent.umpireArranged !== current.umpireArranged) next.umpireArranged = current.umpireArranged;
  for (const playerId of new Set([...Object.keys(sent.responses), ...Object.keys(current.responses)])) {
    const before = sent.responses[playerId];
    const after = current.responses[playerId];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (!after) {
      delete next.responses[playerId];
      continue;
    }
    const saved = canonical.responses[playerId];
    next.responses[playerId] = {
      ...(saved ?? after),
      status: !before || before.status !== after.status ? after.status : saved?.status ?? after.status,
      comment: !before || before.comment !== after.comment ? after.comment : saved?.comment ?? after.comment,
      confirmedRevision: before && before.confirmedRevision !== after.confirmedRevision
        ? canonical.detailsRevision : saved?.confirmedRevision ?? after.confirmedRevision,
    };
  }
  return next;
}

/** The baseline contains only fetched games; unloaded history never becomes a delete. */
export function useScheduleData() {
  const [data, setData] = useState<ScheduleData>(initialScheduleData);
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loginGames, setLoginGames] = useState<ScheduleGame[] | null>(null);
  const [pastLoading, setPastLoading] = useState(false);
  const [pastError, setPastError] = useState("");
  const [hasMorePast, setHasMorePast] = useState(true);
  const [pastLoaded, setPastLoaded] = useState(false);
  const draft = useRef<ScheduleData>(initialScheduleData());
  const baseline = useRef<ScheduleData>(initialScheduleData());
  const currentRevision = useRef(0);
  const currentState = useRef<SaveState>("saved");
  const ready = useRef(false);
  const loadingNow = useRef(true);
  const saving = useRef(false);
  const mounted = useRef(true);
  const epoch = useRef(0);
  const editVersion = useRef(0);
  const loadRequest = useRef(0);
  const pastRequest = useRef(0);
  const pastBusy = useRef(false);
  const pastCursor = useRef<Cursor | null>(null);
  const morePast = useRef(true);

  const publish = useCallback((next: ScheduleData) => {
    draft.current = next;
    setData(next);
  }, []);
  const markState = useCallback((next: SaveState) => {
    currentState.current = next;
    setSaveState(next);
  }, []);
  const setCurrentRevision = useCallback((next: number) => {
    currentRevision.current = next;
    setRevision(next);
  }, []);
  const resetPast = useCallback(() => {
    pastRequest.current += 1;
    pastBusy.current = false;
    pastCursor.current = null;
    morePast.current = true;
    setPastLoading(false);
    setPastError("");
    setPastLoaded(false);
    setHasMorePast(true);
  }, []);
  const isIdle = useCallback(() => ready.current && !loadingNow.current && !saving.current
    && currentState.current === "saved" && !hasDifferences(baseline.current, draft.current), []);

  const load = useCallback(async () => {
    if (saving.current) return;
    const request = ++loadRequest.current;
    const editsAtStart = editVersion.current;
    epoch.current += 1;
    loadingNow.current = true;
    setLoading(true);
    setError("");
    resetPast();
    try {
      const result = validatedSnapshot(await api<ScheduleSnapshot>("/api/schedule", "GET", undefined, API_ERROR));
      if (!mounted.current || request !== loadRequest.current) return;
      // An explicit reload may discard an older draft, but never edits begun while it was loading.
      if (ready.current && editVersion.current !== editsAtStart) {
        if (result.revision !== currentRevision.current) {
          setError(PAGE_CONFLICT);
          markState("conflict");
        } else if (currentState.current !== "conflict") {
          markState(hasDifferences(baseline.current, draft.current) ? "dirty" : "saved");
        }
        return;
      }
      const next = !ready.current && editVersion.current !== editsAtStart
        ? replaceGames(result.data, draft.current.games) : result.data;
      baseline.current = result.data;
      ready.current = true;
      epoch.current += 1;
      setCurrentRevision(result.revision);
      publish(next);
      setLoginGames((current) => current ?? structuredClone(result.data.games));
      markState(hasDifferences(result.data, next) ? "dirty" : "saved");
    } catch (cause) {
      if (mounted.current && request === loadRequest.current) setError(cause instanceof Error ? cause.message : API_ERROR);
    } finally {
      if (mounted.current && request === loadRequest.current) {
        loadingNow.current = false;
        setLoading(false);
      }
    }
  }, [markState, publish, resetPast, setCurrentRevision]);

  /** The caller also guards any editor form whose draft has not reached this hook yet. */
  const refreshIfIdle = useCallback(async () => {
    if (!isIdle()) return;
    const started = epoch.current;
    const editsAtStart = editVersion.current;
    try {
      const result = validatedSnapshot(await api<ScheduleSnapshot>("/api/schedule", "GET", undefined, API_ERROR));
      if (!mounted.current || started !== epoch.current || editsAtStart !== editVersion.current || !isIdle()) return;
      baseline.current = result.data;
      epoch.current += 1;
      setCurrentRevision(result.revision);
      publish(result.data);
      setError("");
      resetPast();
    } catch {
      // A background read never discards the current display or interrupts editing.
    }
  }, [isIdle, publish, resetPast, setCurrentRevision]);

  const edit = useCallback((updater: ScheduleData | ((current: ScheduleData) => ScheduleData)) => {
    const next = typeof updater === "function" ? updater(structuredClone(draft.current)) : structuredClone(updater);
    editVersion.current += 1;
    publish(next);
    if (currentState.current !== "conflict") {
      markState(saving.current || hasDifferences(baseline.current, next) ? "dirty" : "saved");
    }
  }, [markState, publish]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!ready.current || loadingNow.current || saving.current) return false;
    if (currentState.current === "saved") return true;
    if (currentState.current !== "dirty") return false;
    const sent = structuredClone(draft.current);
    const changes = differences(baseline.current, sent);
    if (!changes.games.length && !changes.removedGames.length) {
      markState("saved");
      return true;
    }
    epoch.current += 1;
    saving.current = true;
    markState("saving");
    try {
      const result = validatedSnapshot(await api<ScheduleSnapshot>("/api/schedule", "PUT", {
        partial: true, data: { games: changes.games }, removedGames: changes.removedGames, revision: currentRevision.current,
      }, API_ERROR));
      if (!mounted.current) return false;
      const canonical = new Map(result.data.games.map((game) => [game.id, game]));
      if (canonical.size !== changes.games.length || changes.games.some((game) => !canonical.has(game.id))) {
        throw new Error("保存結果を確認できませんでした。最新データを読み込んでください。");
      }
      const current = new Map(draft.current.games.map((game) => [game.id, game]));
      const updated = changes.games.flatMap((game) => {
        const latest = current.get(game.id);
        return latest ? [mergeFollowingEdits(game, latest, canonical.get(game.id)!)] : [];
      });
      baseline.current = replaceGames(baseline.current, result.data.games, changes.removedGames);
      const next = replaceGames(draft.current, updated);
      epoch.current += 1;
      setCurrentRevision(result.revision);
      publish(next);
      setError("");
      saving.current = false;
      markState(hasDifferences(baseline.current, next) ? "dirty" : "saved");
      return true;
    } catch (cause) {
      if (!mounted.current) return false;
      const failure = cause as ApiError;
      setError(failure.message || API_ERROR);
      markState(failure.status === 409 ? "conflict" : "error");
      return false;
    } finally {
      saving.current = false;
    }
  }, [markState, publish, setCurrentRevision]);

  /** Same-revision reads expand the baseline without changing dirty games or scheduling a save. */
  const mergePage = useCallback((result: ScheduleSnapshot) => {
    const known = new Set(baseline.current.games.map((game) => game.id));
    const additions = result.data.games.filter((game) => !known.has(game.id));
    const local = new Set(draft.current.games.map((game) => game.id));
    baseline.current = replaceGames(baseline.current, additions);
    publish(replaceGames(draft.current, additions.filter((game) => !local.has(game.id))));
  }, [publish]);

  const pageConflict = useCallback(() => {
    if (hasDifferences(baseline.current, draft.current) || currentState.current !== "saved") {
      markState("conflict");
    }
    setError(PAGE_CONFLICT);
  }, [markState]);

  const loadPast = useCallback(async () => {
    if (!ready.current || loadingNow.current || saving.current || pastBusy.current || !morePast.current) return;
    const request = ++pastRequest.current;
    const started = epoch.current;
    const cursor = pastCursor.current;
    pastBusy.current = true;
    setPastLoading(true);
    setPastError("");
    const params = new URLSearchParams({ past: "1" });
    if (cursor) {
      params.set("beforeDate", cursor.date);
      params.set("beforeId", cursor.id);
    }
    try {
      const result = validatedSnapshot(await api<ScheduleSnapshot>(`/api/schedule?${params}`, "GET", undefined, API_ERROR));
      if (!mounted.current || request !== pastRequest.current) return;
      if (started !== epoch.current || loadingNow.current || saving.current) {
        setPastError("保存や再読み込みの後に、もう一度過去の予定を読み込んでください。");
        return;
      }
      if (result.revision !== currentRevision.current) {
        pageConflict();
        setPastError(PAGE_CONFLICT);
        return;
      }
      if (result.hasMore && (!result.nextCursor || typeof result.nextCursor.date !== "string" || typeof result.nextCursor.id !== "string")) {
        throw new Error(API_ERROR);
      }
      mergePage(result);
      pastCursor.current = result.nextCursor ?? null;
      morePast.current = result.hasMore === true;
      setHasMorePast(morePast.current);
      setPastLoaded(true);
    } catch (cause) {
      if (mounted.current && request === pastRequest.current) setPastError(cause instanceof Error ? cause.message : API_ERROR);
    } finally {
      if (mounted.current && request === pastRequest.current) {
        pastBusy.current = false;
        setPastLoading(false);
      }
    }
  }, [mergePage, pageConflict]);

  const loadGame = useCallback(async (id: string): Promise<ScheduleGame | null> => {
    const existing = draft.current.games.find((game) => game.id === id);
    if (existing) return existing;
    if (!ready.current || loadingNow.current || saving.current) return null;
    const started = epoch.current;
    try {
      const result = validatedSnapshot(await api<ScheduleSnapshot>(`/api/schedule?${new URLSearchParams({ id })}`, "GET", undefined, API_ERROR));
      if (!mounted.current || started !== epoch.current || loadingNow.current || saving.current) return null;
      if (result.revision !== currentRevision.current) {
        pageConflict();
        return null;
      }
      mergePage(result);
      return draft.current.games.find((game) => game.id === id) ?? null;
    } catch (cause) {
      if (mounted.current && started === epoch.current) setError(cause instanceof Error ? cause.message : API_ERROR);
      return null;
    }
  }, [mergePage, pageConflict]);

  const retrySave = useCallback(() => {
    if (currentState.current === "error") {
      markState(hasDifferences(baseline.current, draft.current) ? "dirty" : "saved");
    }
  }, [markState]);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      mounted.current = false;
      loadRequest.current += 1;
      pastRequest.current += 1;
      epoch.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (loading || saveState !== "dirty" || saving.current || !ready.current) return;
    const timer = window.setTimeout(() => { void save(); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [data, revision, saveState, loading, save]);

  return {
    data, revision, loading, error, setError, saveState, edit, saveNow: save, load, refreshIfIdle, retrySave, loginGames,
    loadPast, pastLoading, pastError, hasMorePast, pastLoaded, loadGame,
  };
}
