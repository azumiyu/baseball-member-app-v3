"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sortTeamsOneBatters, teamsOneCurrentYear, teamsOneYears, teamsOneSourceUrl, TEAMS_ONE_GAME_TYPES, type TeamsOneGameType, TEAMS_ONE_BATTERS_FRESH_MS, type TeamsOneBattingResponse } from "@/lib/teamsone-batters";
import { ArrowLeftRight, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

export function TeamsOneBatters({ active }: { active: boolean }) {
  const [year, setYear] = useState(teamsOneCurrentYear);
  const [gameType, setGameType] = useState<TeamsOneGameType>("");
  const [unreached, setUnreached] = useState(false);
  const [data, setData] = useState<TeamsOneBattingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null);
  const requestId = useRef(0);
  const saved = useRef(new Map<string, { data: TeamsOneBattingResponse; nextCheckAt: number }>());
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; requestId.current++; };
  }, []);

  const load = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    const key = `${year}:${gameType}:${unreached}`;
    const previous = saved.current.get(key);
    setData(previous?.data ?? null);
    setError("");
    if (!refresh && previous && Date.now() < previous.nextCheckAt) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api<TeamsOneBattingResponse>(`/api/teamsone/batters?year=${year}&gameType=${gameType}&unreached=${unreached}`);
      saved.current.set(key, { data: result, nextCheckAt: Math.max(Date.now() + 60_000, Date.parse(result.fetchedAt) + TEAMS_ONE_BATTERS_FRESH_MS) });
      if (alive.current && id === requestId.current) setData(result);
    } catch (cause) {
      if (previous) previous.nextCheckAt = Date.now() + 60_000;
      if (alive.current && id === requestId.current) setError(cause instanceof Error ? cause.message : "打者成績を読み込めませんでした。");
    } finally {
      if (alive.current && id === requestId.current) setLoading(false);
    }
  }, [year, gameType, unreached]);

  useEffect(() => {
    // Cache each selection and load only on tab visits or selection changes; no polling.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) void load();
  }, [active, load]);

  const changeFilter = (nextYear: number, nextType: TeamsOneGameType, nextUnreached = unreached) => {
    requestId.current++;
    setYear(nextYear);
    setGameType(nextType);
    setUnreached(nextUnreached);
    setData(saved.current.get(`${nextYear}:${nextType}:${nextUnreached}`)?.data ?? null);
    setError("");
    setLoading(true);
  };
  const gameTypeLabel = TEAMS_ONE_GAME_TYPES.find(option => option.value === gameType)?.label ?? "試合属性";

  const rows = useMemo(() => data ? sort ? sortTeamsOneBatters(data.rows, sort.column, sort.descending) : data.rows : [], [data, sort]);
  const changeSort = (column: number) => setSort(current => ({ column, descending: current?.column === column ? !current.descending : column !== -1 }));
  const sortDirection = (column: number) => sort?.column === column ? sort.descending ? "descending" as const : "ascending" as const : undefined;
  const sortMarks = <span className="teamsone-batters-sort-marks" aria-hidden="true"><span>▲</span><span>▼</span></span>;

  return <section className="panel teamsone-batters" aria-labelledby="teamsone-batters-title">
    <div className="teamsone-batters-heading">
      <div>
        <h2 id="teamsone-batters-title">打者成績一覧{data && <small className="teamsone-batters-season">{data.season === "通算" ? "通算" : `${data.season}年`}</small>}</h2>
        <p>teams.one掲載のチーム打者成績</p>
      </div>
      <a href={teamsOneSourceUrl({ year, gameType, unreached })} target="_blank" rel="noopener noreferrer">Teams見る<ExternalLink size={14} aria-hidden="true" /></a>
    </div>
    <div className="teamsone-batters-toolbar">
      <div className="teamsone-batters-filters">
        <label>年<select value={year} onChange={event => changeFilter(Number(event.target.value), gameType)}>
          {teamsOneYears().map(value => <option key={value} value={value}>{value}年</option>)}
        </select></label>
        <label>試合属性<select value={gameType} onChange={event => changeFilter(year, event.target.value as TeamsOneGameType)}>
          {TEAMS_ONE_GAME_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
      </div>
      <label className="teamsone-batters-unreached">
        <input type="checkbox" checked={unreached} onChange={event => changeFilter(year, gameType, event.target.checked)} />
        <span>規定未到達者も含む</span>
      </label>
      <div className="teamsone-batters-status">
        <div className="teamsone-batters-updated">
          {data && <span>最終取得：<time dateTime={data.fetchedAt}>{new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
          }).format(new Date(data.fetchedAt))}</time></span>}
        </div>
        <button type="button" className="secondary teamsone-batters-refresh" disabled={loading} onClick={() => void load(true)}>
          <RefreshCw size={13} aria-hidden="true" className={loading ? "is-spinning" : undefined} />
          {loading ? "読み込み中" : "表示を更新"}
        </button>
      </div>
    </div>
    {loading && <p className="teamsone-batters-message" role="status">{data ? "更新を確認しています…" : "打者成績を読み込んでいます…"}</p>}
    {error && <p className="teamsone-batters-message is-error" role="alert">{error}{data && " 前回の成績を表示しています。"}</p>}
    {data?.stale && !error && <p className="teamsone-batters-message" role="status">Teams.oneの更新を確認できなかったため、前回取得した成績を表示しています。</p>}
    {data && (rows.length ? <>
      <div className="teamsone-batters-table-heading">
        <span className="teamsone-batters-count">選手 <strong>{rows.length}</strong>名</span>
        <p className="teamsone-batters-scroll-hint"><ArrowLeftRight size={14} aria-hidden="true" />横スクロールで全項目を表示</p>
      </div>
      <div className="teamsone-batters-scroll" role="region" aria-label="打者成績一覧（横スクロール）" tabIndex={0}>
        <table className="teamsone-batters-table">
          <caption className="sr-only">YGファイヤーズ {data.season} {gameTypeLabel} 打者成績一覧</caption>
          <thead><tr>
            <th scope="col" aria-sort={sortDirection(-1)}><button type="button" onClick={() => changeSort(-1)}><span>背番号・選手</span>{sortMarks}</button></th>
            {data.columns.map((column, index) => <th key={column} scope="col" aria-sort={sortDirection(index)}>
              <button type="button" onClick={() => changeSort(index)}><span>{column}</span>{sortMarks}</button>
            </th>)}
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <th scope="row"><small>#{row.number}</small><span>{row.name}</span></th>
            {row.values.map((value, index) => <td key={data.columns[index]}>{value}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="teamsone-batters-sort-hint">項目名を押すと昇順・降順を切り替えられます。</p>
    </> : <p className="teamsone-batters-message">対象の打者成績はありません。</p>)}
  </section>;
}
