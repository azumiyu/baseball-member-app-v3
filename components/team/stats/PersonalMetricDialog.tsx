"use client";

import { useRef, type RefObject } from "react";
import type { AuthMember } from "@/lib/auth-types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { teamsOneColumns, type TeamsOneBatter, type TeamsOneStatsKind } from "@/lib/teamsone-batters";
import { personalMetricDescription, personalMetricLeaderboard, personalMetricLowerIsBetter, personalMetricRequiresQualification, personalMetricValue, type PersonalMetricStanding } from "@/lib/teamsone-personal";

export function PersonalMetricDialog({ open, onClose, metric, kind, year, member, player, rankingRows, rankingError, stale, personalStatus, triggerRef }: {
  open: boolean; onClose: () => void; metric: { column: string; label: string } | null;
  kind: TeamsOneStatsKind; year: number; member: AuthMember; player?: TeamsOneBatter;
  rankingRows?: TeamsOneBatter[]; rankingError?: string; stale: boolean; personalStatus?: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const self = player ?? { id: `member:${member.id}`, number: member.number, name: member.name, values: teamsOneColumns(kind).map(() => "—") };
  const qualifiedOnly = personalMetricRequiresQualification(metric?.column ?? "", kind);
  const lowerIsBetter = personalMetricLowerIsBetter(metric?.column ?? "", kind);
  const description = personalMetricDescription(metric?.column ?? "");
  const poolLabel = qualifiedOnly ? "規定到達者" : "全選手";
  const standings = personalMetricLeaderboard(rankingRows ?? [], self, metric?.column ?? "", kind);
  const row = (entry: PersonalMetricStanding, extra = false) => <li
    key={entry.player.id}
    className={`personal-leaderboard-row${entry.isSelf ? " is-self" : ""}${extra ? " is-personal" : ""}`}
  >
    <span className={`personal-leaderboard-rank${entry.rank && entry.rank <= 3 ? ` personal-leaderboard-rank-${entry.rank}` : ""}`}>
      {entry.rank ? <>{entry.rank}<small>位</small></> : "—"}
    </span>
    <div className="personal-leaderboard-player">
      <div className="personal-leaderboard-name"><small>#{entry.player.number}{entry.isSelf && <span className="personal-leaderboard-you">あなた</span>}</small><strong>{entry.player.name}</strong></div>
      {entry.isSelf && !standings.eligible && personalStatus !== "未掲載" && (personalStatus || qualifiedOnly) && <div className="personal-leaderboard-self-label"><span className="personal-leaderboard-unqualified">{personalStatus ? `成績${personalStatus}` : "規定未達"}</span></div>}
    </div>
    <strong className="personal-leaderboard-value">{personalMetricValue(entry.player, metric?.column ?? "", kind)}</strong>
    <span className="personal-leaderboard-gap">{entry.gap}</span>
  </li>;

  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent layout="app" className={metric?.column === "投球回" ? "personal-leaderboard-innings" : undefined}
      onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus({ preventScroll: true }); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (triggerRef.current && !triggerRef.current.closest("[hidden]")) triggerRef.current.focus({ preventScroll: true }); }}
    >
      <div className="team-dialog-header"><DialogTitle ref={titleRef} tabIndex={-1} className="modal-title">{metric?.label}のランキング</DialogTitle></div>
      <div className="team-dialog-body">
        <DialogDescription className="personal-leaderboard-description">{year}年・{kind === "pitching" ? "投手成績" : "野手成績"}の{poolLabel}{!qualifiedOnly && "（規定未達者を含む）"} 上位3人</DialogDescription>
        {description && <p className="personal-leaderboard-note">{description}</p>}
        {rankingRows === undefined ? <p className="personal-leaderboard-note" role={rankingError ? "alert" : "status"}>{rankingError ? `${poolLabel}の成績を取得できませんでした。閉じてから「表示を更新」をお試しください。` : `${poolLabel}の成績を読み込んでいます…`}</p> : <>
          <div className="personal-leaderboard-columns" aria-hidden="true"><span>選手</span><span>成績</span><span>あなたとの差</span></div>
          {standings.leaders.length ? <ol className="personal-leaderboard-list" aria-label={`${poolLabel}の上位3人`}>{standings.leaders.map(entry => row(entry))}</ol> : <p className="personal-leaderboard-note">この項目の{qualifiedOnly && "規定到達者の"}成績はありません。</p>}
          {standings.personal && <ul className="personal-leaderboard-list personal-leaderboard-personal" aria-label="あなたの成績">{row(standings.personal, true)}</ul>}
          {qualifiedOnly && !standings.eligible && !personalStatus && <p className="personal-leaderboard-note">規定未達のため、あなたの成績はランキングの下に表示しています。差は表示しません。</p>}
          {personalStatus && !standings.eligible && <p className="personal-leaderboard-note">{personalStatus === "照合不可" ? "同姓同名の選手を特定できませんでした。登録名と背番号をご確認ください。" : "あなたの成績を確認できないため、差は表示していません。"}</p>}
          <p className="personal-leaderboard-note">{lowerIsBetter ? "数値が小さい順。" : "数値が多い順。"}「あと」は同じ成績に追いつく差です。</p>
        </>}
        {stale && <p className="personal-leaderboard-note" role="status">更新を確認できなかったため、前回取得した{poolLabel}の成績を表示しています。</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
