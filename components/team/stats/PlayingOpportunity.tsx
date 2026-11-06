"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import type { Player } from "@/lib/model";
import {
  sortTeamsOneBatters,
  teamsOneCurrentYear,
  teamsOneStatNumber,
  teamsOneYears,
  TEAMS_ONE_BATTERS_FRESH_MS,
  type TeamsOneBattingResponse,
  type TeamsOneBatter,
} from "@/lib/teamsone-batters";
import { findPersonalBatter } from "@/lib/teamsone-personal";
import { api } from "../lib/api";

type Period = number | "all";
type CacheEntry = { data: TeamsOneBattingResponse; nextCheckAt: number };
type OpportunityRow = TeamsOneBatter & {
  member: Player;
  games: number | null;
  plateAppearances: number | null;
  averagePlateAppearances: number | null;
  atBats: number | null;
  averageAtBats: number | null;
  matched: boolean;
};

function fixedTwo(value: number) {
  return value.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PlayingOpportunity({ players, active }: { players: Player[]; active: boolean }) {
  const [period, setPeriod] = useState<Period>(() => teamsOneCurrentYear());
  const [data, setData] = useState<TeamsOneBattingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ column: 0, descending: false });
  const requestId = useRef(0);
  const saved = useRef(new Map<string, CacheEntry>());
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    const key = String(period);
    const previous = saved.current.get(key);
    setData(previous?.data ?? null);
    setError("");
    if (!refresh && previous && Date.now() < previous.nextCheckAt) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({ year: key, unreached: "true" });
      const result = await api<TeamsOneBattingResponse>(`/api/teamsone/batters?${query}`);
      const fetchedAt = Date.parse(result.fetchedAt);
      saved.current.set(key, {
        data: result,
        nextCheckAt: Number.isFinite(fetchedAt)
          ? Math.max(Date.now() + 60_000, fetchedAt + TEAMS_ONE_BATTERS_FRESH_MS)
          : Date.now() + 60_000,
      });
      if (alive.current && id === requestId.current) setData(result);
    } catch (cause) {
      if (previous) previous.nextCheckAt = Date.now() + 60_000;
      if (alive.current && id === requestId.current) {
        setError(cause instanceof Error ? cause.message : "Teams.oneの成績を取得できませんでした。");
      }
    } finally {
      if (alive.current && id === requestId.current) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    // Cache each period and fetch only when the tab is open or refreshed.
    if (active) void load();
  }, [active, load]);

  const rows = useMemo<OpportunityRow[]>(() => {
    if (!data) return [];
    const gamesColumn = data.columns.indexOf("試合数");
    const plateAppearancesColumn = data.columns.indexOf("打席");
    const atBatsColumn = data.columns.indexOf("打数");
    return players.map((member) => {
      const match = findPersonalBatter(data.rows, member);
      const source = match.player;
      const rawGames = source && gamesColumn >= 0 ? source.values[gamesColumn] : undefined;
      const rawPlateAppearances = source && plateAppearancesColumn >= 0
        ? source.values[plateAppearancesColumn]
        : undefined;
      const rawAtBats = source && atBatsColumn >= 0 ? source.values[atBatsColumn] : undefined;
      const parsedGames = teamsOneStatNumber(rawGames);
      const parsedPlateAppearances = teamsOneStatNumber(rawPlateAppearances);
      const parsedAtBats = teamsOneStatNumber(rawAtBats);
      const matched = !!source && Number.isFinite(parsedGames)
        && Number.isFinite(parsedPlateAppearances) && Number.isFinite(parsedAtBats);
      const games = matched ? parsedGames : null;
      const plateAppearances = matched ? parsedPlateAppearances : null;
      const atBats = matched ? parsedAtBats : null;
      const averagePlateAppearances = games !== null && plateAppearances !== null && games > 0
        ? plateAppearances / games
        : null;
      const averageAtBats = games !== null && atBats !== null && games > 0 ? atBats / games : null;
      return {
        id: member.id,
        number: member.number,
        name: member.name,
        member,
        games,
        plateAppearances,
        averagePlateAppearances,
        atBats,
        averageAtBats,
        matched,
        values: [
          averagePlateAppearances === null ? "—" : String(averagePlateAppearances),
          plateAppearances === null ? "—" : String(plateAppearances),
          averageAtBats === null ? "—" : String(averageAtBats),
          atBats === null ? "—" : String(atBats),
          games === null ? "—" : String(games),
        ],
      };
    });
  }, [data, players]);

  const sortedRows = useMemo(
    () => sortTeamsOneBatters(rows, sort.column, sort.descending) as OpportunityRow[],
    [rows, sort],
  );
  const matchedRows = rows.filter((row) => row.matched && row.games !== null);
  const averageRows = rows.filter((row) => row.matched && row.averagePlateAppearances !== null);
  const lowestAverage = averageRows.length
    ? Math.min(...averageRows.map((row) => row.averagePlateAppearances!))
    : Number.POSITIVE_INFINITY;
  const teamAverage = averageRows.length
    ? averageRows.reduce((total, row) => total + row.averagePlateAppearances!, 0) / averageRows.length
    : null;
  const recommendationRows = averageRows.filter((row) => fixedTwo(row.averagePlateAppearances!) === fixedTwo(lowestAverage));
  const candidateNames = recommendationRows.map((row) => row.member.name).join("、");
  const sortDirection = (column: number) => sort.column === column
    ? sort.descending ? "descending" as const : "ascending" as const
    : undefined;
  const sortMarks = <span className="teamsone-batters-sort-marks" aria-hidden="true"><span>▲</span><span>▼</span></span>;
  const label = period === "all" ? "通算" : `${period}年`;

  const changePeriod = (next: Period) => {
    if (next === period) return;
    requestId.current++;
    setPeriod(next);
    setData(saved.current.get(String(next))?.data ?? null);
    setSort({ column: 0, descending: false });
    setError("");
    setLoading(true);
  };

  return (
    <section className="panel stats-opportunity" aria-labelledby="stats-opportunity-title">
      <div className="stats-opportunity-heading">
        <div>
          <h2 id="stats-opportunity-title">メンバー別の出場機会</h2>
          <p>Teams.oneの打席数を1試合ごとに平均し、出場機会を比較できます。試合数は参考情報として表示します。</p>
        </div>
        <label className="stats-opportunity-period">
          <span>集計期間</span>
          <select value={period} onChange={(event) => changePeriod(event.currentTarget.value === "all" ? "all" : Number(event.currentTarget.value))} aria-label="出場機会の集計期間">
            <option value="all">通算</option>
            {teamsOneYears().map((year) => <option key={year} value={year}>{year}年</option>)}
          </select>
        </label>
        <button type="button" className="secondary teamsone-batters-refresh" disabled={loading} onClick={() => void load(true)}>
          <RefreshCw size={13} aria-hidden="true" className={loading ? "is-spinning" : undefined} />
          {loading ? "取得中" : "更新"}
        </button>
      </div>

      <div className="stats-opportunity-metrics">
        <div><span>1試合平均打席数</span><strong>{teamAverage === null ? "—" : fixedTwo(teamAverage)}<small>打席</small></strong></div>
        <div><span>Teams.one照合済み</span><strong>{matchedRows.length}<small> / {players.length}人</small></strong></div>
        <div><span>対象メンバー</span><strong>{players.length}<small>人</small></strong></div>
      </div>

      {data && recommendationRows.length > 0 && (
        <div className="stats-opportunity-candidate">
          <strong>1試合平均打席数が少ないメンバー</strong>
          <p>{candidateNames}（{fixedTwo(lowestAverage)}打席 / 試合）</p>
        </div>
      )}

      {loading && <p className="teamsone-batters-message" role="status">Teams.oneの成績を取得しています…</p>}
      {error && <p className="teamsone-batters-message is-error" role="alert">{error}{data && " 前回取得した成績を表示しています。"}</p>}
      {data?.stale && !error && <p className="teamsone-batters-message" role="status">Teams.oneを更新できなかったため、前回取得した成績を表示しています。</p>}

      {data && (sortedRows.length ? <>
        <div className="teamsone-batters-table-heading">
          <span className="teamsone-batters-count">対象メンバー<strong>{sortedRows.length}</strong>人</span>
          <p className="teamsone-batters-scroll-hint"><ArrowLeftRight size={14} aria-hidden="true" />横スクロールで全項目を表示</p>
        </div>
        <div className="teamsone-batters-scroll" role="region" aria-label="出場機会一覧（横スクロールできます）" tabIndex={0}>
          <table className="teamsone-batters-table teamsone-batters-list-table stats-opportunity-table">
            <caption className="sr-only">{label}のTeams.one成績を使ったメンバー別1試合平均打席数、打席数、1試合平均打数、打数、試合数</caption>
            <thead><tr>
              <th scope="col" aria-sort={sortDirection(-1)}>
                <button type="button" onClick={() => setSort((current) => ({ column: -1, descending: current.column === -1 ? !current.descending : false }))}>
                  <span>背番号・選手</span>{sortMarks}
                </button>
              </th>
              {["1試合平均打席", "打席", "1試合平均打数", "打数", "試合数"].map((column, index) => <th key={column} scope="col" aria-sort={sortDirection(index)}>
                <button type="button" onClick={() => setSort((current) => ({ column: index, descending: current.column === index ? !current.descending : index === 1 }))}>
                  <span>{column}</span>{sortMarks}
                </button>
              </th>)}
            </tr></thead>
            <tbody>{sortedRows.map((row) => <tr key={row.id}>
              <th scope="row"><small>#{row.number}</small><span>{row.name}</span></th>
              <td>{row.averagePlateAppearances === null ? "—" : fixedTwo(row.averagePlateAppearances)}</td>
              <td>{row.plateAppearances === null ? "—" : row.plateAppearances}</td>
              <td>{row.averageAtBats === null ? "—" : fixedTwo(row.averageAtBats)}</td>
              <td>{row.atBats === null ? "—" : row.atBats}</td>
              <td>{row.games === null ? "—" : row.games}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="stats-opportunity-sort-hint">1試合平均打席数が少ない順に表示しています。試合数は参考値です。</p>
      </> : <p className="teamsone-batters-message">メンバー情報がありません。</p>)}

      {data && matchedRows.length < players.length && (
        <p className="stats-opportunity-note">試合数・打席数はTeams.oneの選択期間の成績です。名前と背番号で照合できないメンバーや出場試合数が0のメンバーは平均を算出できないため「—」で表示しています。</p>
      )}
      {!data && !loading && !error && <p className="teamsone-batters-message">成績データがありません。</p>}
    </section>
  );
}
