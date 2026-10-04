import type { Metadata } from "next";
import { HomePage, type NextGame } from "@/components/home/HomePage";
import { db } from "@/lib/server";
import { japanDate } from "@/lib/schedule";
import { readHomeContent } from "@/lib/home-content-store";

export const dynamic = "force-dynamic";

const HOME_URL = "https://site-creator-vinext-starter.hokuieren1212.workers.dev/home";
const HOME_TITLE = "YGファイヤーズ（YG）公式ホームページ | YG FIRES";
const HOME_DESCRIPTION =
  "YG（YGファイヤーズ／YG FIRES）は、城東区を中心に毎週土曜日に活動する草野球チームです。公式ホームページで試合結果、次の試合、お知らせ、選手募集、Instagram・YouTubeの情報を掲載しています。";

const teamStructuredData = {
  "@context": "https://schema.org",
  "@type": "SportsTeam",
  name: "YGファイヤーズ",
  alternateName: ["YG", "YG FIRES", "YGファイヤーズ"],
  description: HOME_DESCRIPTION,
  sport: "野球",
  url: HOME_URL,
  logo: "https://site-creator-vinext-starter.hokuieren1212.workers.dev/homepage/YGrogo.PNG",
  sameAs: [
    "https://www.instagram.com/yg_fires/",
    "https://www.youtube.com/@YG-fm1qt",
  ],
};

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: {
    canonical: HOME_URL,
  },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: HOME_URL,
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
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(teamStructuredData).replace(/</g, "\\u003c"),
        }}
      />
      <HomePage nextGame={nextGame} nextGameUnavailable={nextGameUnavailable} content={content?.data ?? null} />
    </>
  );
}
