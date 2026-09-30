"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, Trophy } from "lucide-react";

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

export function HomePage() {
  const [games, setGames] = useState<RecentGame[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
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
          setFetchedAt(data.fetchedAt);
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

  const formattedFetchedAt = fetchedAt
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(fetchedAt))
    : "";

  return (
    <main className="home-page">
      <header className="home-header">
        <a className="home-logo" href="/" aria-label="YG FIRES ホーム">
          <span className="home-logo-mark">YG</span>
          <span>
            <strong>YG FIRES</strong>
            <small>BASEBALL TEAM</small>
          </span>
        </a>

        <nav className="home-nav" aria-label="メインナビゲーション">
          <a href="#games">試合結果</a>
          <a href="#columns">コラム</a>
          <a href="#follow">Follow Us</a>
          <a className="home-member-link" href="/member">
            メンバー向け
          </a>
        </nav>
      </header>

      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">YG · FIRES</p>
          <h1>
            野球を、もっと
            <br />
            <span>熱く。</span>
          </h1>
          <p className="home-lead">
            YG FIRESの公式ホームページ。チームの試合結果や最新情報を、ここから。
          </p>
          <div className="home-hero-actions">
            <a className="home-primary-button" href="#games">
              直近5試合を見る <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <a
              className="home-text-link"
              href={TEAMS_URL}
              target="_blank"
              rel="noreferrer"
            >
              Teamsで見る <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="home-hero-card">
          <div className="home-hero-card-inner">
            <Image
              src="/homepage/YGrogo.PNG"
              alt="YG FIRES"
              fill
              priority
              sizes="(max-width: 820px) 100vw, 500px"
              className="home-hero-logo"
            />
          </div>
        </div>
      </section>

      <section id="games" className="home-section home-games">
        <div className="home-section-heading">
          <div>
            <p className="home-eyebrow">LATEST GAMES</p>
            <h2>直近5試合</h2>
          </div>
          <a
            className="home-outline-link"
            href={TEAMS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Teams <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>

        <div className="home-games-meta">
          <span>Teamsから自動取得</span>
          {formattedFetchedAt && <span>最終取得 {formattedFetchedAt}</span>}
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
                  {game.result && <small>{game.result}</small>}
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
              YG FIRESでは、一緒に野球を楽しむメンバーを募集しています。
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
        <a href="/member">メンバー向けアプリ →</a>
        <small>© {new Date().getFullYear()} YG FIRES</small>
      </footer>
    </main>
  );
}