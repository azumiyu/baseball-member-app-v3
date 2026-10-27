"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { TeamsOneBattingResponse, TeamsOneStatsKind } from "@/lib/teamsone-batters";
import { teamsOneSourceUrl } from "@/lib/teamsone-batters";
import { teamsOneCumulativeLeaders, teamsOneCumulativeStats } from "@/lib/teamsone-cumulative";
import { api } from "../lib/api";

type Entry = { data?: TeamsOneBattingResponse; error?: string };

export function TeamsOneCumulative({ active }: { active: boolean }) {
  const [kind, setKind] = useState<TeamsOneStatsKind>("batting");
  const [batting, setBatting] = useState<Entry>();
  const [pitching, setPitching] = useState<Entry>();
  const [loading, setLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const metricTrigger = useRef<HTMLButtonElement | null>(null);
  const loaded = useRef(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    const [battingResult, pitchingResult] = await Promise.allSettled([
      api<TeamsOneBattingResponse>("/api/teamsone/batters?year=all&unreached=true"),
      api<TeamsOneBattingResponse>("/api/teamsone/pitchers?year=all&unreached=true"),
    ]);
    setBatting((previous) => battingResult.status === "fulfilled"
      ? { data: battingResult.value }
      : { data: previous?.data, error: battingResult.reason instanceof Error ? battingResult.reason.message : "野手成績を取得できませんでした。" });
    setPitching((previous) => pitchingResult.status === "fulfilled"
      ? { data: pitchingResult.value }
      : { data: previous?.data, error: pitchingResult.reason instanceof Error ? pitchingResult.reason.message : "投手成績を取得できませんでした。" });
    busy.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!active || loaded.current) return;
    loaded.current = true;
    void load();
  }, [active, load]);

  const entry = kind === "pitching" ? pitching : batting;
  const source = teamsOneSourceUrl({ year: "all", gameType: "", unreached: true, kind });
  const totals = entry?.data ? teamsOneCumulativeStats(entry.data, kind) : undefined;
  const leaders = selectedMetric && entry?.data ? teamsOneCumulativeLeaders(entry.data, kind, selectedMetric) : [];
  const teamMetricValue = selectedMetric
    ? [...(totals?.rates ?? []), ...(totals?.totals ?? [])].find((metric) => metric.label === selectedMetric)?.value
    : undefined;
  const metricButton = (metric: { label: string; value: string }) => <button
    type="button"
    className="stats-cumulative-metric"
    aria-haspopup="dialog"
    aria-label={`${metric.label}の上位3人を見る`}
    onClick={(event) => { metricTrigger.current = event.currentTarget; setSelectedMetric(metric.label); }}
  >
    <span>{metric.label}</span>
    <strong>{metric.value}</strong>
  </button>;

  return <section className="panel teamsone-batters stats-cumulative" aria-labelledby="teamsone-cumulative-title" aria-busy={loading}>
    <div className="teamsone-batters-heading">
      <h2 id="teamsone-cumulative-title">チーム累計成績<small className="teamsone-batters-season">通算</small></h2>
      <span>　</span>    
  </div>
    <nav className="tabs stats-entry-subtabs teamsone-stats-subtabs" aria-label="累計成績の種類">
      <button type="button" className={kind === "batting" ? "active" : ""} aria-pressed={kind === "batting"} onClick={() => setKind("batting")}>野手成績</button>
      <button type="button" className={kind === "pitching" ? "active" : ""} aria-pressed={kind === "pitching"} onClick={() => setKind("pitching")}>投手成績</button>
    </nav>
    <div className="personal-stats-update">
      <span>{entry?.data ? <>最終取得：<time dateTime={entry.data.fetchedAt}>{new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.data.fetchedAt))}</time></> : "規定未到達者を含む全選手・全試合"}</span>
      <button type="button" className="secondary teamsone-batters-refresh" disabled={loading} onClick={() => void load()}><RefreshCw size={13} aria-hidden="true" className={loading ? "is-spinning" : undefined} />{loading ? "読み込み中" : "表示を更新"}</button>
    </div>
    {loading && <p className="teamsone-batters-message" role="status">Teams.oneの通算成績を読み込んでいます…</p>}
    {entry?.error && <p className="teamsone-batters-message is-error" role="alert">{entry.error}{entry.data && " 前回取得した成績を表示しています。"}</p>}
    {entry?.data?.stale && !entry.error && <p className="teamsone-batters-message" role="status">Teams.oneを更新できなかったため、前回取得した成績を表示しています。</p>}
    {entry?.data && totals && <>
      <p className="stats-cumulative-note">規定未到達者を含むTeams.oneの通算成績から集計しています。試合数は合算せず、率はチームの合計値から計算しています。対象選手：{entry.data.rows.length}名{kind === "batting" && "。得点圏打率は計算に必要な打数が公開されていないため表示していません。"}</p>
      <h3 className="stats-cumulative-heading">率</h3>
      <div className="stats-cumulative-grid is-rates">
        {totals.rates.map((metric) => <div key={metric.label}>{metricButton(metric)}</div>)}
      </div>
      <h3 className="stats-cumulative-heading">累計</h3>
      <div className="stats-cumulative-grid">
        {totals.totals.map((metric) => <div key={metric.label}>{metricButton(metric)}</div>)}
      </div>
      {entry.data.rows.length === 0 && <p className="teamsone-batters-message">通算成績が見つかりませんでした。</p>}
    </>}
    {!loading && !entry?.data && !entry?.error && <p className="teamsone-batters-message" role="status">累計成績はまだ読み込まれていません。</p>}
    <Dialog open={selectedMetric !== null} onOpenChange={(open) => { if (!open) setSelectedMetric(null); }}>
      <DialogContent
        layout="app"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (metricTrigger.current && !metricTrigger.current.closest("[hidden]")) metricTrigger.current.focus({ preventScroll: true });
        }}
      >
        <div className="team-dialog-header"><DialogTitle className="modal-title">{selectedMetric}の上位3人</DialogTitle></div>
        <div className="team-dialog-body">
          <DialogDescription className="personal-leaderboard-description">チーム合計：{teamMetricValue ?? "—"}。規定未到達者を含む全選手の通算成績です。{kind === "pitching" && (selectedMetric === "防御率" || selectedMetric === "WHIP") ? "数値が低い順に表示しています。" : "数値が高い順に表示しています。"}</DialogDescription>
          {leaders.length > 0 ? <ol className="personal-leaderboard-list" aria-label={`${selectedMetric}の上位3人`}>
            {leaders.map((leader, index) => <li key={leader.id} className="personal-leaderboard-row stats-cumulative-leader-row">
              <span className={`personal-leaderboard-rank personal-leaderboard-rank-${index + 1}`}>{index + 1}<small>位</small></span>
              <div className="personal-leaderboard-player"><div className="personal-leaderboard-name"><small>#{leader.number}</small><strong>{leader.name}</strong></div></div>
              <strong className="personal-leaderboard-value">{leader.value}</strong>
            </li>)}
          </ol> : <p className="personal-leaderboard-note">この指標の成績はありません。</p>}
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
