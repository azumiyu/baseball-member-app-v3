import type { Metadata } from "next";
import { HomePage, type NextGame } from "@/components/home/HomePage";
import { db } from "@/lib/server";
import { japanDate } from "@/lib/schedule";
import { readHomeContent } from "@/lib/home-content-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "YGファイヤーズ（YG FIRES）公式ホームページ",
  description:
    "草野球チーム・YGファイヤーズ（YG FIRES）の公式ホームページ。試合結果、次の試合、お知らせ、選手募集、Instagram・YouTubeの情報を掲載しています。",
  robots: { index: true, follow: true },
  alternates: {
    canonical: "https://site-creator-vinext-starter.hokuieren1212.workers.dev/home",
  },
  openGraph: {
    title: "YGファイヤーズ（YG FIRES）公式ホームページ",
    description: "YGファイヤーズの試合情報、お知らせ、選手募集を紹介します。",
    url: "https://site-creator-vinext-starter.hokuieren1212.workers.dev/home",
    siteName: "YGファイヤーズ（YG FIRES）",
    locale: "ja_JP",
    type: "website",
  },
};

export default async function Home() {
  const now = new Date();
  const today = japanDate(now);
  const time = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
  let nextGame: NextGame | null = null;
  let nextGameUnavailable = false;
  const contentResult = readHomeContent(true).catch(() => null);

  try {
    nextGame = await db().prepare(`
      SELECT date, opponent, start_time AS startTime, status
      FROM schedule_games
      WHERE date > ? OR (date = ? AND (start_time = '' OR start_time >= ?))
      ORDER BY date, CASE WHEN start_time = '' THEN '24:00' ELSE start_time END, id
      LIMIT 1
    `).bind(today, today, time).first<NextGame>();
  } catch {
    nextGameUnavailable = true;
  }

  const content = await contentResult;
  return <HomePage nextGame={nextGame} nextGameUnavailable={nextGameUnavailable} content={content?.data ?? null} />;
}
