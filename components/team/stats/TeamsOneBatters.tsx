"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sortTeamsOneBatters, teamsOneCanUseRecentGames, teamsOneFilterKey, teamsOneCurrentYear, teamsOneYears, teamsOneSourceUrl, TEAMS_ONE_GAME_TYPES, type TeamsOneStatsKind, type TeamsOneSelectOption, type TeamsOneFilters, type TeamsOneGameType, TEAMS_ONE_BATTERS_FRESH_MS, type TeamsOneBattingResponse } from "@/lib/teamsone-batters";
import { ArrowLeftRight, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

export function TeamsOneBatters({ active }: { active: boolean }) {
  const [kind, setKind] = useState<TeamsOneStatsKind>("batting");
  const [year, setYear] = useState<TeamsOneFilters["year"]>(teamsOneCurrentYear);
  const [gameType, setGameType] = useState<TeamsOneGameType>("");
  const [unreached, setUnreached] = useState(false);
  const [recent5, setRecent5] = useState(false);
  const [opponent, setOpponent] = useState("");
  const [tournament, setTournament] = useState("");
  const [options, setOptions] = useState<{ opponents: TeamsOneSelectOption[]; tournaments: TeamsOneSelectOption[] }>({ opponents: [], tournaments: [] });
  const [data, setData] = useState<TeamsOneBattingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ column: -1, descending: false });
  const requestId = useRef(0);
  const saved = useRef(new Map<string, { data: TeamsOneBattingResponse; nextCheckAt: number }>());
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; requestId.current++; };
  }, []);

  const load = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    const key = teamsOneFilterKey({ year, gameType, unreached, recent5, opponent, tournament, kind });
    const previous = saved.current.get(key);
    setData(previous?.data ?? null);
    if (previous) setOptions({ opponents: previous.data.opponents, tournaments: previous.data.tournaments });
    setError("");
    if (!refresh && previous && Date.now() < previous.nextCheckAt) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({ year: String(year), gameType, unreached: String(unreached), recent5: String(recent5), opponent, tournament });
      const result = await api<TeamsOneBattingResponse>(`/api/teamsone/${kind === "pitching" ? "pitchers" : "batters"}?${query}`);
      saved.current.set(key, { data: result, nextCheckAt: Math.max(Date.now() + 60_000, Date.parse(result.fetchedAt) + TEAMS_ONE_BATTERS_FRESH_MS) });
      if (alive.current && id === requestId.current) {
        setData(result);
        setOptions({ opponents: result.opponents, tournaments: result.tournaments });
      }
    } catch (cause) {
      if (previous) previous.nextCheckAt = Date.now() + 60_000;
      if (alive.current && id === requestId.current) setError(cause instanceof Error ? cause.message : "成績を読み込めませんでした。");
    } finally {
      if (alive.current && id === requestId.current) setLoading(false);
    }
  }, [year, gameType, unreached, recent5, opponent, tournament, kind]);

  useEffect(() => {
    // Cache each selection and load only on tab visits or selection changes; no polling.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) void load();
  }, [active, load]);

  const changeFilter = (patch: Partial<TeamsOneFilters>) => {
    const next = { year, gameType, unreached, recent5, opponent, tournament, kind, ...patch };
    if (!teamsOneCanUseRecentGames(next)) next.recent5 = false;
    const key = teamsOneFilterKey(next);
    if (key === teamsOneFilterKey({ year, gameType, unreached, recent5, opponent, tournament, kind })) return;
    requestId.current++;
    setKind(next.kind);
    if (next.kind !== kind) setSort({ column: -1, descending: false });
    setYear(next.year);
    setGameType(next.gameType);
    setUnreached(next.unreached);
    setRecent5(!!next.recent5);
    setOpponent(next.opponent);
    setTournament(next.tournament);
    setData(saved.current.get(key)?.data ?? null);
    setError("");
    setLoading(true);
  };
  const statsLabel = kind === "pitching" ? "投手成績" : "野手成績";
  const canUseRecent5 = teamsOneCanUseRecentGames({ year, gameType, opponent, tournament });
  const gameTypeLabel = TEAMS_ONE_GAME_TYPES.find(option => option.value === gameType)?.label ?? "試合属性";

  const rows = useMemo(() => data ? sortTeamsOneBatters(data.rows, sort.column, sort.descending) : [], [data, sort]);
  const changeSort = (column: number) => setSort(current => ({ column, descending: current.column === column ? !current.descending : column !== -1 }));
  const sortDirection = (column: number) => sort.column === column ? sort.descending ? "descending" as const : "ascending" as const : undefined;
  const sortMarks = <span className="teamsone-batters-sort-marks" aria-hidden="true"><span>▲</span><span>▼</span></span>;

  return <section className="panel teamsone-batters" aria-labelledby="teamsone-batters-title">
    <div className="teamsone-batters-heading">
      <div>
        <h2 id="teamsone-batters-title">成績一覧{data && <small className="teamsone-batters-season">{/^\d{4}$/.test(data.season) ? `${data.season}年` : data.season}</small>}</h2>
      </div>
      <a href={teamsOneSourceUrl({ year, gameType, unreached, recent5, opponent, tournament, kind })} target="_blank" rel="noopener noreferrer">Teams見る<ExternalLink size={14} aria-hidden="true" /></a>
    </div>
    <nav className="tabs stats-entry-subtabs teamsone-stats-subtabs" aria-label="表示する成績">
      <button type="button" className={kind === "batting" ? "active" : ""} aria-pressed={kind === "batting"} onClick={() => changeFilter({ kind: "batting" })}>野手成績</button>
      <button type="button" className={kind === "pitching" ? "active" : ""} aria-pressed={kind === "pitching"} onClick={() => changeFilter({ kind: "pitching" })}>投手成績</button>
    </nav>
    <div className="teamsone-batters-toolbar">
      <div className="teamsone-batters-filters">
        <label>年<select value={year} onChange={event => changeFilter({ year: event.target.value === "all" ? "all" : Number(event.target.value) })}>
          <option value="all">通算</option>
          {teamsOneYears().map(value => <option key={value} value={value}>{value}年</option>)}
        </select></label>
        <label>試合属性<select value={gameType} onChange={event => changeFilter({ gameType: event.target.value as TeamsOneGameType })}>
          {TEAMS_ONE_GAME_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label>対戦チーム<select value={opponent} disabled={!options.opponents.length} onChange={event => changeFilter({ opponent: event.target.value })}>
          <option value="">指定なし</option>
          {options.opponents.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label>大会名<select value={tournament} disabled={!options.tournaments.length} onChange={event => changeFilter({ tournament: event.target.value })}>
          <option value="">指定なし</option>
          {options.tournaments.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
      </div>
      <div className="teamsone-batters-checkboxes">
        <label className="teamsone-batters-unreached">
          <input type="checkbox" checked={unreached} onChange={event => changeFilter({ unreached: event.target.checked })} />
          <span>規定未到達者も含む</span>
        </label>
        <label className={`teamsone-batters-unreached${canUseRecent5 ? "" : " is-disabled"}`} title={canUseRecent5 ? undefined : "年・試合属性・対戦チーム・大会名を初期値に戻すと選択できます。"}>
          <input type="checkbox" checked={recent5} disabled={!canUseRecent5} onChange={event => changeFilter({ recent5: event.target.checked })} />
          <span>直近5試合</span>
        </label>
      </div>
      {recent5 && data?.recentGames && <p className="teamsone-batters-recent-note">{data.recentGames.length ? `${data.recentGames.at(-1)!.date.replaceAll("-", "/")}〜${data.recentGames[0].date.replaceAll("-", "/")}の${data.recentGames.length}試合（公式戦・練習試合）` : "今年の対象試合はありません"}</p>}
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
    {loading && <p className="teamsone-batters-message" role="status">{data ? "更新を確認しています…" : `${statsLabel}を読み込んでいます…`}</p>}
    {error && <p className="teamsone-batters-message is-error" role="alert">{error}{data && " 前回の成績を表示しています。"}</p>}
    {data?.stale && !error && <p className="teamsone-batters-message" role="status">Teams.oneの更新を確認できなかったため、前回取得した成績を表示しています。</p>}
    {data && (rows.length ? <>
      <div className="teamsone-batters-table-heading">
        <span className="teamsone-batters-count">選手 <strong>{rows.length}</strong>名</span>
        <p className="teamsone-batters-scroll-hint"><ArrowLeftRight size={14} aria-hidden="true" />横スクロールで全項目を表示</p>
      </div>
      <div className="teamsone-batters-scroll" role="region" aria-label={`${statsLabel}一覧（横スクロール）`} tabIndex={0}>
        <table className="teamsone-batters-table teamsone-batters-list-table">
          <caption className="sr-only">YGファイヤーズ {data.season} {gameTypeLabel} {statsLabel}一覧</caption>
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
    </> : <p className="teamsone-batters-message">対象の{statsLabel}はありません。</p>)}
  </section>;
}
