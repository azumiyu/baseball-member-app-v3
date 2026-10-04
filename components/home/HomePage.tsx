"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Pencil, X } from "lucide-react";
import type { AuthResponse } from "@/lib/auth-types";
import type { HomeColumn, HomeContent } from "@/lib/home-content";
import { api } from "@/components/team/lib/api";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import readerStyles from "./ColumnReader.module.css";

export type NextGame = {
  date: string;
  opponent: string;
  startTime: string;
  status: "unconfirmed" | "proposed" | "confirmed";
};

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
const YOUTUBE_URL = "https://www.youtube.com/@YG-fm1qt";

export function HomePage({ nextGame, nextGameUnavailable = false, content }: {
  nextGame: NextGame | null;
  nextGameUnavailable?: boolean;
  content: HomeContent | null;
}) {
  const [games, setGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [columnIndex, setColumnIndex] = useState(0);
  const [openedColumn, setOpenedColumn] = useState<HomeColumn | null>(null);
  const columnTrack = useRef<HTMLDivElement>(null);
  const columnTrigger = useRef<HTMLButtonElement>(null);
  const columnTitle = useRef<HTMLHeadingElement>(null);
  const columns = content?.columns ?? [];
  const currentColumn = Math.min(columnIndex, Math.max(0, columns.length - 1));
  const readingMinutes = Math.max(1, Math.ceil((openedColumn?.body.replace(/\s/g, "").length ?? 0) / 500));

  function showColumn(index: number) {
    const track = columnTrack.current;
    const slide = track?.children.item(index) as HTMLElement | null;
    if (track && slide) track.scrollTo({ left: slide.offsetLeft });
  }
  const matchDate = nextGame ? new Date(`${nextGame.date}T12:00:00+09:00`) : null;
  const matchWeekday = matchDate
    ? new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(matchDate)
    : "";

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
    void api<AuthResponse>("/api/auth").then((auth) => {
      if (active) setCanEdit(auth.authenticated && auth.member?.canEditLineup === true);
    }).catch(() => {});

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
            <strong>YG FIRES</strong>
            <small>BASEBALL CLUB</small>
          </span>
        </Link>

        <nav className="home-nav" aria-label="メインナビゲーション">
          <a href="#games">試合結果</a>
          <a href="#columns">コラム</a>
          <a className="home-member-link" href="/">
            ログイン
          </a>
        </nav>
      </header>

      {canEdit && <div className="home-admin-bar">
        <span>管理者メニュー</span>
        <a href="/home/edit"><Pencil size={15} aria-hidden="true" />お知らせ・コラムを編集</a>
      </div>}

      <section className="home-hero" aria-labelledby="home-next-title">
        <div className="home-match-card">
          <div className="home-match-heading">
            <div>
              <p className="home-eyebrow">NEXT GAME</p>
              <h1 id="home-next-title">次の予定</h1>
            </div>
            <div className="home-match-date">
              {nextGame ? (
                <time dateTime={nextGame.date}>
                  <span>{nextGame.date.slice(0, 4)}</span>
                  <strong>
                    {Number(nextGame.date.slice(5, 7))}<i>/</i>{Number(nextGame.date.slice(8, 10))}
                    <small>（{matchWeekday}）</small>
                  </strong>
                </time>
              ) : <span>{nextGameUnavailable ? "取得できませんでした" : "日程調整中"}</span>}
            </div>
          </div>
          <div className="home-matchup">
            <div className="home-match-team home-match-opponent">
              <span className="home-team-label">OPPONENT</span>
              <div className="home-opponent-name"><strong>{nextGame?.opponent || "対戦相手未定"}</strong></div>
              <small>対戦相手</small>
            </div>
            <div className="home-match-time">
              <span className="home-match-vs">VS</span>
              <strong className={nextGame?.startTime ? undefined : "home-time-undecided"}>
                {nextGame?.startTime || "時間未定"}
              </strong>
              <small>PLAY BALL</small>
            </div>
            <div className="home-match-team">
              <span className="home-team-label">YG FIRES</span>
              <div className="home-match-logo">
                <Image
                  src="/homepage/YGrogo.PNG"
                  alt="YG FIRES チームロゴ"
                  fill
                  priority
                  sizes="(max-width: 520px) 100px, (max-width: 820px) 140px, 180px"
                  className="home-hero-logo"
                />
              </div>
              <small>YGファイヤーズ</small>
            </div>
          </div>
          <div className="home-match-footer">
            {nextGame ? (
              <>
                <span className="home-match-status"><i aria-hidden="true" />{nextGame.status === "confirmed" ? "対戦決定" : "日程・対戦を調整中"}</span>
                <span>⚾🔥</span>
              </>
            ) : (
              <p role="status">{nextGameUnavailable
                ? "次の予定を読み込めませんでした。時間をおいて再度ご確認ください。"
                : "次の予定は、決まり次第お知らせします。"}</p>
            )}
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
            {content?.notices.map((notice) => (
              <li key={notice.id}>
                {notice.date && <time className="home-content-date" dateTime={notice.date}>{notice.date.replaceAll("-", ".")}</time>}
                <span className="home-notice-text" title={notice.text}>
                  {notice.text}
                </span>
              </li>
            ))}
            {content?.notices.length === 0 && <li>新しいお知らせはありません。</li>}
            {!content && <li role="status">お知らせを読み込めませんでした。</li>}
          </ul>
        </div>
      </section>

      <a href="/home/about" className="home-about-link">
        <div><span>ABOUT YG FIRES</span><strong>チーム紹介</strong></div>
        <span className="home-about-caption">活動場所・戦歴・会費など</span>
        <ArrowUpRight size={22} aria-hidden="true" />
      </a>

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
                  <span
                    className={`home-game-type${game.type.includes("公式戦") ? " home-game-type-official" : game.type.includes("練習試合") ? " home-game-type-practice" : ""}`}
                  >
                    {game.type || "試合"}
                  </span>
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

      <section id="columns" className="home-section home-columns" aria-labelledby="home-columns-title">
        <div className="home-section-heading">
          <div>
            <p className="home-eyebrow">COLUMN</p>
            <h2 id="home-columns-title">コラム</h2>
          </div>
        </div>

        {columns.length > 0 ? <>
          <div
            ref={columnTrack}
            className="home-column-track"
            role="region"
            aria-roledescription="カルーセル"
            aria-label="チームのコラム"
            tabIndex={columns.length > 1 ? 0 : undefined}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              const index = event.key === "ArrowLeft" ? currentColumn - 1 : event.key === "ArrowRight" ? currentColumn + 1 : event.key === "Home" ? 0 : event.key === "End" ? columns.length - 1 : null;
              if (index !== null) { event.preventDefault(); showColumn(Math.max(0, Math.min(columns.length - 1, index))); }
            }}
            onScroll={(event) => {
              const track = event.currentTarget;
              const first = track.children.item(0) as HTMLElement | null;
              const second = track.children.item(1) as HTMLElement | null;
              const step = first && second ? second.offsetLeft - first.offsetLeft : track.clientWidth;
              if (step > 0) setColumnIndex(Math.round(track.scrollLeft / step));
            }}
          >
            {columns.map((column, index) => <article key={column.id} className="home-column-card" role="group" aria-roledescription="スライド" aria-label={`${index + 1} / ${columns.length}：${column.title}`}>
              <div className="home-column-image-wrap">
                <Image src={column.imageUrl || "/homepage/YGrogo.PNG"} alt={column.imageAlt || column.title} fill unoptimized sizes="(max-width: 820px) 100vw, 650px" className={`home-column-image${column.imageUrl ? "" : " home-column-image-placeholder"}`} />
              </div>
              <div className="home-column-copy">
                <p className="home-column-label">YG FIRES · COLUMN {String(index + 1).padStart(2, "0")}</p>
                {column.date && <time className="home-content-date" dateTime={column.date}>{column.date.replaceAll("-", ".")}</time>}
                <h3>{column.title}</h3>
                <p className="home-column-excerpt">{column.body}</p>
                <div className="home-column-links">
                  <button type="button" className="home-recruit-link" onClick={(event) => { columnTrigger.current = event.currentTarget; setOpenedColumn(column); }} aria-label={`${column.title}の続きを読む`}>続きを読む<ArrowUpRight size={17} aria-hidden="true" /></button>
                  {column.linkUrl && <a className="home-recruit-link" href={column.linkUrl} target="_blank" rel="noreferrer">{column.linkLabel || "詳しくはこちら"}<ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a>}
                </div>
              </div>
            </article>)}
          </div>
          {columns.length > 1 && <div className="home-column-navigation">
            <span className="home-column-swipe-hint">横にスワイプして読む</span>
            <div>
              <button type="button" onClick={() => showColumn(currentColumn - 1)} disabled={currentColumn === 0} aria-label="前のコラム"><ChevronLeft size={20} aria-hidden="true" /></button>
              <span aria-live="polite" aria-atomic="true">{currentColumn + 1} / {columns.length}</span>
              <button type="button" onClick={() => showColumn(currentColumn + 1)} disabled={currentColumn >= columns.length - 1} aria-label="次のコラム"><ChevronRight size={20} aria-hidden="true" /></button>
            </div>
          </div>}
        </> : <p className="home-empty">{content ? "コラムは準備中です。お楽しみに。" : "コラムを読み込めませんでした。"}</p>}
      </section>

      <Dialog open={openedColumn !== null} onOpenChange={(open) => { if (!open) setOpenedColumn(null); }}>
        <DialogContent
          layout="app"
          className={readerStyles.reader}
          showCloseButton={false}
          onOpenAutoFocus={(event) => { event.preventDefault(); columnTitle.current?.focus({ preventScroll: true }); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); columnTrigger.current?.focus({ preventScroll: true }); }}
        >
          <div className={readerStyles.toolbar}>
            <span className={readerStyles.masthead}>YG FIRES <b aria-hidden="true">/</b> COLUMN</span>
            <DialogClose asChild><button type="button" className={readerStyles.close}><span>閉じる</span><X size={20} aria-hidden="true" /></button></DialogClose>
          </div>
          <DialogDescription className="sr-only">YG FIRESのコラム全文。読了の目安は約{readingMinutes}分です。</DialogDescription>
          {openedColumn && <article className={readerStyles.article}>
            {openedColumn.imageUrl && <figure className={readerStyles.cover}>
              <Image src={openedColumn.imageUrl} alt={openedColumn.imageAlt || openedColumn.title} fill unoptimized sizes="(max-width: 600px) 100vw, 850px" />
            </figure>}
            <div className={readerStyles.content}>
              <header className={readerStyles.heading}>
                <p className={readerStyles.kicker}>FROM THE FIELD</p>
                <DialogTitle ref={columnTitle} tabIndex={-1} className={readerStyles.title}>{openedColumn.title}</DialogTitle>
                <div className={readerStyles.meta}><span>YG FIRES · コラム</span>{openedColumn.date && <time dateTime={openedColumn.date}>{openedColumn.date.replaceAll("-", ".")}</time>}<span>約{readingMinutes}分で読めます</span></div>
              </header>
              <div className={readerStyles.body}>
                {openedColumn.body.split(/\r?\n[\t ]*\r?\n+/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
              <footer className={readerStyles.articleFooter}>
                <span className={readerStyles.endmark} aria-hidden="true">YG</span>
                {openedColumn.linkUrl && <a className={readerStyles.link} href={openedColumn.linkUrl} target="_blank" rel="noreferrer">{openedColumn.linkLabel || "詳しくはこちら"}<ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a>}
              </footer>
            </div>
          </article>}
        </DialogContent>
      </Dialog>

      <footer className="home-footer">
        <div id="follow" className="home-footer-social" aria-label="SNSリンク">
          <div className="home-social-grid">
            <a
              className="home-social-card"
              href={INSTAGRAM_URL}
              aria-label="YG FIRESのInstagram（新しいタブで開く）"
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
            </a>

            <a
              className="home-social-card"
              href={YOUTUBE_URL}
              aria-label="YG FIRESのYouTube（新しいタブで開く）"
              target="_blank"
              rel="noreferrer"
            >
              <span className="home-social-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                  <rect x="2" y="5" width="20" height="14" rx="4" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m10 9 6 3-6 3V9Z" fill="currentColor" />
                </svg>
              </span>
            </a>
          </div>
        </div>
        <small>© {new Date().getFullYear()} YG FIRES</small>
      </footer>
    </main>
  );
}
