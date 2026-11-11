import { Trophy } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/games/api-types";
import styles from "./Games.module.css";

export function formatGameMoney(value: number) {
  return `${value.toLocaleString("ja-JP")} 円`;
}

export function GameLeaderboard({ entries, personalBest, memberId, scoreUnit = "円", scoreScale = 1, precision = 0, cumulative = false, rankingNote, personalScoreLabel }: {
  entries: LeaderboardEntry[];
  personalBest: LeaderboardEntry | null;
  memberId: string;
  scoreUnit?: string;
  scoreScale?: number;
  precision?: number;
  cumulative?: boolean;
  rankingNote?: string;
  personalScoreLabel?: string;
}) {
  const formatScore = (score: number) => `${(score / scoreScale).toLocaleString("ja-JP", { minimumFractionDigits: precision, maximumFractionDigits: precision })} ${scoreUnit}`;
  const formatWaterBreakdown = (entry: LeaderboardEntry) =>
    `手持ち ${formatScore(entry.handMl ?? 0)} · 貯水池 ${formatScore(entry.reservoirMl ?? 0)}`;
  return (
    <section className={styles.leaderboard} aria-label="上位スコアランキング">
      <div className={styles.sectionTitle}><Trophy size={18} aria-hidden="true" /><h2>チームランキング</h2><span>TOP 10</span></div>
      <p className={styles.rankingNote}>{rankingNote ?? (cumulative ? "これまでにあげた水の累計で競います。給水するたびに記録へ加算。" : "ゲーム終了時の記録で競います。各選手の自己ベストを掲載。")}</p>
      <div className={styles.personalBest}><span>{personalScoreLabel ?? (cumulative ? "あなたの累計給水量" : "あなたの最高記録")}</span><strong>{personalBest ? formatScore(personalBest.score) : "まだ記録がありません"}</strong>{personalBest && <small>{personalBest.rank} 位</small>}{personalBest?.reservoirOwned && <span className={styles.personalComposition}>{formatWaterBreakdown(personalBest)}</span>}</div>
      {entries.length ? (
        <ol className={styles.rankingList}>
          {entries.map((entry) => (
            <li key={entry.playerId} data-self={entry.playerId === memberId}>
              <span className={styles.rank}>{String(entry.rank).padStart(2, "0")}</span>
              <span className={styles.rankingName}>{entry.name}{entry.playerId === memberId && <small>YOU</small>}{entry.reservoirOwned && <small className={styles.rankingComposition}>{formatWaterBreakdown(entry)}</small>}</span>
              <strong>{formatScore(entry.score)}</strong>
            </li>
          ))}
        </ol>
      ) : <p className={styles.empty}>最初の記録を残そう。</p>}
    </section>
  );
}
