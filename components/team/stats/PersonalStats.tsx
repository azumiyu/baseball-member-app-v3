"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Crown, ExternalLink, RefreshCw } from "lucide-react";
import type { AuthMember } from "@/lib/auth-types";
import {
  teamsOneColumns, TEAMS_ONE_BATTERS_FRESH_MS, sortTeamsOneBatters,
  teamsOneCurrentYear, teamsOneYears, teamsOneSourceUrl, type TeamsOneBattingResponse, type TeamsOneStatsKind,
} from "@/lib/teamsone-batters";
import { findPersonalBatter, PERSONAL_BATTING_METRICS, PERSONAL_PITCHING_METRICS, personalMetricRank, personalMetricRequiresQualification, personalMetricValue } from "@/lib/teamsone-personal";
import { api } from "../lib/api";
import { PersonalMetricDialog } from "./PersonalMetricDialog";

type Entry = { data?: TeamsOneBattingResponse; error?: string };
type Entries = Record<string, Entry>;
type Sort = { column: number; descending: boolean };

export function PersonalStats({ active, member }: { active: boolean; member: AuthMember }) {
  const [kind, setKind] = useState<TeamsOneStatsKind>("batting");
  const [hasOpenedPitching, setHasOpenedPitching] = useState(false);
  const navigation = <nav className="tabs stats-entry-subtabs teamsone-stats-subtabs" aria-label="個人成績の種類">
    <button type="button" className={kind === "batting" ? "active" : ""} aria-pressed={kind === "batting"} onClick={() => setKind("batting")}>野手成績</button>
    <button type="button" className={kind === "pitching" ? "active" : ""} aria-pressed={kind === "pitching"} onClick={() => { setHasOpenedPitching(true); setKind("pitching"); }}>投手成績</button>
  </nav>;
  return <>
    <div hidden={kind !== "batting"}><PersonalStatsPanel active={active && kind === "batting"} member={member} kind="batting" navigation={navigation} /></div>
    {hasOpenedPitching && <div hidden={kind !== "pitching"}><PersonalStatsPanel active={active && kind === "pitching"} member={member} kind="pitching" navigation={navigation} /></div>}
  </>;
}

function PersonalStatsPanel({ active, member, kind, navigation }: {
  active: boolean; member: AuthMember; kind: TeamsOneStatsKind; navigation: ReactNode;
}) {
  const year = teamsOneCurrentYear();
  const pitching = kind === "pitching";
  const columns = teamsOneColumns(kind);
  const metricColumns = pitching ? PERSONAL_PITCHING_METRICS : PERSONAL_BATTING_METRICS;
  const statsName = pitching ? "投手成績" : "野手成績";
  const [entries, setEntries] = useState<Entries>({});
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<Sort>({ column: -1, descending: true });
  const [selectedMetric, setSelectedMetric] = useState<{ column: string; label: string } | null>(null);
  const [metricOpen, setMetricOpen] = useState(false);
  const metricTrigger = useRef<HTMLButtonElement | null>(null);
  const saved = useRef<Entries>({});
  const nextCheckAt = useRef(new Map<string, number>());
  const busy = useRef(false);
  const alive = useRef(false);
  const visible = useRef(active);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => { visible.current = active; }, [active]);

  const load = useCallback(async (refresh = false) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    async function read(season: string, qualifiedOnly = false) {
      const key = qualifiedOnly ? `qualified:${season}` : season;
      if (!refresh && Date.now() < (nextCheckAt.current.get(key) ?? 0)) return;
      try {
        const data = await api<TeamsOneBattingResponse>(`/api/teamsone/${pitching ? "pitchers" : "batters"}?year=${season}&unreached=${!qualifiedOnly}`);
        saved.current = { ...saved.current, [key]: { data } };
        nextCheckAt.current.set(key, Math.max(Date.now() + 60_000, Date.parse(data.fetchedAt) + TEAMS_ONE_BATTERS_FRESH_MS));
      } catch (cause) {
        saved.current = { ...saved.current, [key]: { ...saved.current[key], error: cause instanceof Error ? cause.message : "成績を取得できませんでした。" } };
        nextCheckAt.current.set(key, Date.now() + 60_000);
      }
      if (alive.current) setEntries(saved.current);
    }
    try {
      // Fetch this year's values and qualified ranking pool first; at most two requests at a time.
      await Promise.all([read(String(year)), read(String(year), true)]);
      if (!alive.current || !visible.current) return;
      const queue = [...teamsOneYears().filter(value => value !== year).reverse().map(String), "all"];
      await Promise.all([0, 1].map(async () => {
        let season: string | undefined;
        while (alive.current && visible.current && (season = queue.shift()) !== undefined) await read(season);
      }));
    } finally {
      busy.current = false;
      if (alive.current) setLoading(false);
    }
  }, [year, pitching]);

  useEffect(() => {
    // Lazy loading, no polling. Results survive switches to other stats tabs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) void load();
  }, [active, load]);

  const selection = (entry: Entry | undefined) => findPersonalBatter(entry?.data?.rows ?? [], member);
  const message = (entry: Entry | undefined) => {
    if (!entry) return "成績を読み込んでいます…";
    if (entry.error) return `${entry.error}${entry.data ? " 前回取得した成績を表示しています。" : ""}`;
    if (selection(entry).ambiguous) return "同姓同名の選手を特定できませんでした。Teams.oneの登録名と背番号をご確認ください。";
    if (!selection(entry).player) return "";
    if (entry.data?.stale) return "更新を確認できなかったため、前回取得した成績を表示しています。";
    return "";
  };
  const current = entries[String(year)];
  const qualified = entries[`qualified:${year}`];
  const rankingEntry = selectedMetric && personalMetricRequiresQualification(selectedMetric.column, kind) ? qualified : current;
  const career = entries.all;
  const careerPlayer = selection(career).player;
  const statusLabel = (entry: Entry | undefined) => {
    const match = selection(entry);
    return entry?.error ? entry.data ? "前回取得" : "取得失敗" : !entry ? "読込中" : match.ambiguous ? "照合不可" : !match.player ? "未掲載" : entry.data?.stale ? "前回取得" : "";
  };
  const years = useMemo(() => {
    const rows = teamsOneYears().map(value => {
      const player = findPersonalBatter(entries[String(value)]?.data?.rows ?? [], member).player;
      return { id: String(value), number: String(value), name: String(value), values: player?.values ?? columns.map(() => "—") };
    });
    return sortTeamsOneBatters(rows, sort.column, sort.descending);
  }, [entries, member, sort, columns]);
  const changeSort = (column: number) => setSort(current => ({ column, descending: current.column === column ? !current.descending : true }));
  const direction = (column: number) => sort.column === column ? sort.descending ? "descending" as const : "ascending" as const : undefined;
  const marks = <span className="teamsone-batters-sort-marks" aria-hidden="true"><span>▲</span><span>▼</span></span>;
  const metrics = (entry: Entry | undefined) => {
    const player = selection(entry).player;
    return <dl className="personal-stats-metrics">
      {metricColumns.map(([column, label]) => {
        const qualifiedOnly = personalMetricRequiresQualification(column, kind);
        const rank = personalMetricRank((qualifiedOnly ? qualified : entry)?.data?.rows ?? [], player, column, kind);
        return <div key={column} className={column === "投球回" ? "personal-stats-innings" : undefined}>
          <dt><button
            type="button" className="personal-stats-metric-trigger" aria-haspopup="dialog"
            aria-label={`${label}の上位3人と自分の成績を見る`}
            onClick={event => { metricTrigger.current = event.currentTarget; setSelectedMetric({ column, label }); setMetricOpen(true); }}
          >{label}</button>{rank !== undefined && rank <= 3 && <span
            className={`personal-stats-rank personal-stats-rank-${rank}`}
            role="img" aria-label={`チーム内${rank}位（${qualifiedOnly ? "規定到達者" : "規定未達者を含む全選手"}）`}
            title={`${qualifiedOnly ? "規定到達者" : "規定未達者を含む全選手"}の中で${rank}位（同率を含む・${pitching && column === "防御率" ? "数値が小さい順" : "数値が多い順"}）`}
          ><Crown size={13} aria-hidden="true" /><span aria-hidden="true">{rank}位</span></span>}</dt>
          <dd>{personalMetricValue(player, column, kind)}</dd>
        </div>;
      })}
    </dl>;
  };
  const notice = (entry: Entry | undefined) => message(entry) && <p className={`teamsone-batters-message${entry?.error ? " is-error" : ""}`} role={entry?.error ? "alert" : "status"}>{message(entry)}</p>;

  return <div className="personal-stats" aria-busy={loading}>
    <section className="panel teamsone-batters" aria-labelledby={`personal-current-title-${kind}`}>
      <div className="teamsone-batters-heading">
        <div>
          <h2 id={`personal-current-title-${kind}`}>今年の成績<small className="teamsone-batters-season">{year}年</small></h2>
          <p className="personal-stats-player" title={member.name}><span>#{member.number}</span><span className="personal-stats-player-name">{member.name}</span></p>
        </div>
        <a href={teamsOneSourceUrl({ year, gameType: "", unreached: true, kind })} target="_blank" rel="noopener noreferrer">Teamsで見る<ExternalLink size={14} aria-hidden="true" /></a>
      </div>
      {navigation}
      <div className="personal-stats-update">
        <span>{current?.data ? <>最終取得：<time dateTime={current.data.fetchedAt}>{new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(current.data.fetchedAt))}</time></> : `Teams.one掲載の個人${statsName}`}</span>
        <button type="button" className="secondary teamsone-batters-refresh" disabled={loading} onClick={() => void load(true)}><RefreshCw size={13} aria-hidden="true" className={loading ? "is-spinning" : undefined} />{loading ? "読み込み中" : "表示を更新"}</button>
      </div>
      {notice(current)}
      {metrics(current)}
      {selection(current).player && <p className="personal-stats-rank-note">{pitching ? "王冠は今年の上位3位です。勝率・防御率は規定到達者、他の項目は規定未達者も対象です。防御率は小さい順、他の項目は多い順・同率は同順位、0は対象外です。" : "王冠は今年の上位3位です。打率・出塁率・長打率・得点圏打率・OPSは規定到達者、他の項目は規定未達者も対象です。全項目で数値が多い順・同率は同順位、0は対象外です。"}</p>}
      {(qualified?.error || qualified?.data?.stale) && <p className="personal-stats-rank-note" role="status">{qualified.data ? "規定到達者の順位は前回取得した成績を基に表示しています。" : "規定到達者の成績を取得できなかったため、規定到達が必要な項目の王冠は表示していません。"}</p>}
    </section>

    <PersonalMetricDialog
      open={active && metricOpen} onClose={() => setMetricOpen(false)}
      metric={selectedMetric} kind={kind} year={year} member={member}
      player={selection(rankingEntry).player ?? selection(current).player}
      rankingRows={rankingEntry?.data?.rows} rankingError={rankingEntry?.error}
      stale={!!rankingEntry?.data && (!!rankingEntry.error || rankingEntry.data.stale)}
      personalStatus={current?.error && !current.data ? "取得失敗" : !current ? "読込中" : selection(current).ambiguous ? "照合不可" : !selection(current).player ? "未掲載" : undefined}
      triggerRef={metricTrigger}
    />

    <section className="panel teamsone-batters personal-stats-history" aria-labelledby={`personal-history-title-${kind}`}>
      <div className="teamsone-batters-heading"><div><h2 id={`personal-history-title-${kind}`}>年別の{statsName}</h2><p>年ごとの成績をまとめて確認できます。</p></div></div>
      <div className="teamsone-batters-table-heading"><span className="teamsone-batters-count">年別</span><p className="teamsone-batters-scroll-hint"><ArrowLeftRight size={14} aria-hidden="true" />横スクロールで全項目を表示</p></div>
      <div className="teamsone-batters-scroll" role="region" aria-label={`年別の${statsName}（横スクロール）`} tabIndex={0}>
        <table className="teamsone-batters-table">
          <caption className="sr-only">{member.name} 年別・通算の{statsName}一覧</caption>
          <thead><tr>
            <th scope="col" aria-sort={direction(-1)}><button type="button" onClick={() => changeSort(-1)}><span>年</span>{marks}</button></th>
            {columns.map((column, index) => <th key={column} scope="col" aria-sort={direction(index)}><button type="button" onClick={() => changeSort(index)}><span>{column}</span>{marks}</button></th>)}
          </tr></thead>
          <tbody>{years.map(row => {
            const entry = entries[row.id];
            const status = statusLabel(entry);
            return <tr key={row.id}><th scope="row"><span>{row.id}年</span>{status && status !== "未掲載" && <small title={message(entry)}>{status}</small>}</th>{row.values.map((value, index) => <td key={columns[index]}>{value}</td>)}</tr>;
          })}</tbody>
          <tfoot><tr>
            <th scope="row"><span>通算</span>{statusLabel(career) && statusLabel(career) !== "未掲載" && <small title={message(career)}>{statusLabel(career)}</small>}</th>
            {columns.map(column => <td key={column}>{personalMetricValue(careerPlayer, column, kind)}</td>)}
          </tr></tfoot>
        </table>
      </div>
      <p className="teamsone-batters-sort-hint">項目名を押すと昇順・降順を切り替えられます。「—」は未掲載・未取得の成績です。</p>
      {notice(career)}
    </section>
  </div>;
}
