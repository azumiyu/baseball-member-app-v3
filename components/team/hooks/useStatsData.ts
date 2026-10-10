"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialStatsData, type StatsData, type StatsLineupData, type StatsLineups, type StatsSchedulePage } from "@/lib/stats";
import { api } from "../lib/api";
import { useAutosavedData, type AutosavedDataSource, type DataSnapshot } from "./useAutosavedData";

const API_ERROR = "成績データを処理できませんでした。";

// Preserve partial writes: unrelated games are neither sent nor rewritten.
function saveStats(data: StatsData, revision: number, savedJson: string) {
  const previous = savedJson ? JSON.parse(savedJson) as StatsData : initialStatsData();
  const games = Object.fromEntries(
    Object.entries(data.games).filter(([key, game]) =>
      JSON.stringify(game) !== JSON.stringify(previous.games[key]) || data.scheduleIds[key] !== previous.scheduleIds[key],
    ),
  );
  const removedGames = Object.keys(previous.games).filter((key) => !Object.hasOwn(data.games, key));
  const scheduleIds = Object.fromEntries(Object.keys(games).filter((key) => data.scheduleIds[key]).map((key) => [key, data.scheduleIds[key]]));
  return api<DataSnapshot<StatsData> & StatsLineupData>("/api/stats", "PUT", { data: { games, scheduleIds }, removedGames, partial: true, revision }, API_ERROR);
}

export function useStatsData() {
  const [lineups, setLineups] = useState<StatsLineups>({});
  const [page, setPage] = useState<StatsSchedulePage>({ schedules: [], hasMoreSchedules: false, nextScheduleCursor: null });
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const pageBusy = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current += 1; };
  }, []);
  const save = useCallback(async (data: StatsData, revision: number, savedJson: string) => {
    const request = epoch.current;
    const result = await saveStats(data, revision, savedJson);
    if (mounted.current && epoch.current === request) setLineups(result.lineups);
    return result;
  }, []);
  const source = useMemo<AutosavedDataSource<StatsData>>(() => ({
    initialData: initialStatsData,
    load: async () => {
      const request = ++epoch.current;
      const result = await api<DataSnapshot<StatsData> & StatsSchedulePage & StatsLineupData>("/api/stats", "GET", undefined, API_ERROR);
      if (mounted.current && epoch.current === request) {
        setPage({ schedules: result.schedules, hasMoreSchedules: result.hasMoreSchedules, nextScheduleCursor: result.nextScheduleCursor });
        setLineups(result.lineups);
        setScheduleError("");
      }
      return result;
    },
    save,
    acceptSavedData: true,
    loadError: "成績データを読み込めませんでした。",
  }), [save]);
  const stats = useAutosavedData(source);
  const loadOlderSchedules = useCallback(async () => {
    if (!page.hasMoreSchedules || !page.nextScheduleCursor || pageBusy.current || stats.loading) return;
    const request = epoch.current;
    pageBusy.current = true;
    setSchedulesLoading(true);
    setScheduleError("");
    try {
      const params = new URLSearchParams({ beforeDate: page.nextScheduleCursor.date, beforeId: page.nextScheduleCursor.id });
      const next = await api<StatsSchedulePage>(`/api/stats/schedules?${params}`, "GET", undefined, API_ERROR);
      if (!mounted.current || request !== epoch.current) return;
      setPage((current) => ({ ...next, schedules: [...new Map([...current.schedules, ...next.schedules].map((game) => [game.id, game])).values()] }));
    } catch (cause) {
      if (mounted.current && request === epoch.current) setScheduleError(cause instanceof Error ? cause.message : API_ERROR);
    } finally {
      pageBusy.current = false;
      if (mounted.current) setSchedulesLoading(false);
    }
  }, [page.hasMoreSchedules, page.nextScheduleCursor, stats.loading]);
  return { ...stats, lineups, schedules: page.schedules, hasMoreSchedules: page.hasMoreSchedules, schedulesLoading, scheduleError, loadOlderSchedules };
}
