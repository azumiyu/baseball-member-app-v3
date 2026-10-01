"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, CircleAlert, Trophy } from "lucide-react";

type RecentGame = {
  id: string;
  date: string;
  type: string;
  opponent: string;
  score: string;
  result: string;
  url: string;
};

type GamesResponse =
  | { ok: true; games: RecentGame[]; fetchedAt: string; source: string }
  | { ok: false; error: string };

const INSTAGRAM_URL = "https://www.instagram.com/yg_fires?stkn=bWo3MHYzcm01MzZ3";
const TEAMS_URL = "https://teams.one/teams/ygfires/game";

// お知らせは下記の3件を書き換えて更新します。
const NOTICES = [
  { id: "notice-1", text: "川鍋：台湾へ出張" },
  { id: "notice-2", text: "芝田：深谷に移住" },
  { id: "notice-3", text: "川高：9月打率8割" },
];

export function HomePage() {
  const [games, setGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadGames() {
      try {
        const response = await fetch("/api/teamsone/games", { cache: "no-store" });
        const data = (await response.json()) as GamesResponse;

        if (!response.ok || !data.ok) {
          throw new Error(data.ok ? "試合情報を取得できませんでした。" : data.error);
        }

        if (active) {
          setGames(data.games);
          setError("");
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "試合情報を取得できませんでした。",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadGames();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="home-page">
      <header className="home-header">
        <Link className="home-logo" href="/home" aria-label="YG FIRES ホーム">
          <span className="home-logo-mark">Y</span>
          <span>
            <strong>YG</strong>
            <small>HOME PAGE</small>
          </span>
        </Link>

        <nav className="home-nav" aria-label="メインナビゲーション">
          <a href="#games">試合結果</a>
          <a href="#columns">コラム</a>
          <a href="#follow">Follow Us</a>
          <Link className="home-member-link" href="/">
            ログイン
          </Link>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">YG · FIRES</p>
          <div className="home-hero-card">
            <div className="home-hero-card-inner">
              <Image
                src="/homepage/YGrogo.PNG"
                alt="YG FIRES"
                fill
                priority
                sizes="(max-width: 520px) 140px, 160px"
                className="home-hero-logo"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="news" className="home-section home-news" aria-labelledby="home-news-title">
        <div className="home-notice-panel">
          <h2 id="home-news-title" className="home-notice-label">
            <CircleAlert size={20} aria-hidden="true" />
            お知らせ
          </h2>
          <ul className="home-notice-list">
            {NOTICES.map((notice) => (
              <li key={notice.id}>
                <span className="home-notice-text" title={notice.text}>
                  {notice.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="games" className="home-section home-games">
        <div className="home-section-heading">
          <div>
            <p className="home-eyebrow">LATEST GAMES</p>
            <h2>直近5試合</h2>
          </div>
        </div>

        {loading ? (
          <div className="home-loading" aria-live="polite">
            試合情報を読み込んでいます…
          </div>
        ) : error ? (
          <div className="home-error" role="alert">
            {error}
          </div>
        ) : games.length === 0 ? (
          <div className="home-empty">表示できる試合情報がありません。</div>
        ) : (
          <div className="home-game-list">
            {games.map((game) => (
              <a
                className="home-game-card"
                key={game.id}
                href={game.url}
                target="_blank"
                rel="noreferrer"
              >
                <div className="home-game-date">
                  <CalendarDays size={18} aria-hidden="true" />
                  <time dateTime={game.date.replaceAll("/", "-")}>
                    {game.date}
                  </time>
                </div>

                <div className="home-game-main">
                  <span className="home-game-type">{game.type || "試合"}</span>
                  <strong>{game.opponent}</strong>
                </div>

                <div className="home-game-score">
                  <span>RESULT</span>
                  <strong>{game.score || "—"}</strong>
                  {game.result && (
                    <small
                      className={
                        /勝/.test(game.result)
                          ? "home-result-win"
                          : /負|敗/.test(game.result)
                            ? "home-result-loss"
                            : /引|分/.test(game.result)
                              ? "home-result-draw"
                              : undefined
                      }
                    >
                      {game.result}
                    </small>
                  )}
                </div>

                <ArrowUpRight
                  className="home-game-arrow"
                  size={19}
                  aria-hidden="true"
                />
              </a>
            ))}
          </div>
        )}
      </section>

      <section id="columns" className="home-section home-columns">
        <div className="home-section-heading">
          <div>
            <p className="home-eyebrow">COLUMN</p>
            <h2>コラム</h2>
          </div>
        </div>

        <article className="home-column-card">
          <div className="home-column-image-wrap">
            <Image
              src="/homepage/bosyu.JPG"
              alt="YG FIRES 選手募集"
              fill
              sizes="(max-width: 820px) 100vw, 700px"
              className="home-column-image"
            />
          </div>
          <div className="home-column-copy">
            <p className="home-column-label">MEMBER RECRUITMENT</p>
            <h3>選手募集</h3>
            <p>
              YG FIRESでは、楽しみながら本気でプロスタを目指しているチームです。<br />興味のある方はぜひInstagramのDMにてご連絡ください。
            </p>
          </div>
        </article>
      </section>

      <section id="follow" className="home-section home-follow">
        <div className="home-section-heading">
          <div>
            <p className="home-eyebrow">FOLLOW US</p>
            <h2>YG FIRESの最新情報</h2>
          </div>
        </div>

        <div className="home-social-grid">
          <a
            className="home-social-card"
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span className="home-social-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="25" height="25" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="17.3" cy="6.8" r="1.1" fill="currentColor" />
              </svg>
            </span>
            <span>
              <small>Instagram</small>
              <strong>@yg_fires</strong>
            </span>
            <ArrowUpRight size={19} aria-hidden="true" />
          </a>

          <a
            className="home-social-card"
            href={TEAMS_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span className="home-social-icon">
              <Trophy size={24} aria-hidden="true" />
            </span>
            <span>
              <small>Teams</small>
              <strong>試合・チーム情報</strong>
            </span>
            <ArrowUpRight size={19} aria-hidden="true" />
          </a>
        </div>
      </section>

      <footer className="home-footer">
        <div>
          <strong>YG FIRES</strong>
          <span>BASEBALL TEAM</span>
        </div>
        <Link href="/">メンバー向けアプリ →</Link>
        <small>© {new Date().getFullYear()} YG FIRES</small>
      </footer>
    </main>
  );
}
