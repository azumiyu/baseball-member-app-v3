"use client";

/* eslint-disable @next/next/no-img-element -- Local game artwork needs no image service. */
import { ArrowUpRight, Gamepad2 } from "lucide-react";
import { GAME_CATALOG, type GameDefinition } from "@/lib/games/catalog";
import { GameLeaderboard } from "./GameLeaderboard";
import { GameAccessState, GameShell } from "./GameShell";
import { useGameApi } from "./useGameApi";
import styles from "./Games.module.css";

function GameCard({ game }: { game: GameDefinition }) {
  const api = useGameApi(game.id);
  return <GameCardContent game={game} api={api} />;
}

function GameCardContent({ game, api }: { game: GameDefinition; api: ReturnType<typeof useGameApi> }) {
  return (
    <article className={styles.gameCard}>
      <a href={game.href} className={styles.gameLink}>
        <div className={styles.cardArt} data-crop={game.imageCrop}><img src={game.image} alt="" /><span>TEAM RECORD<br />CHALLENGE</span></div>
        <div className={styles.cardCopy}><small>YG ORIGINAL</small><h2>{game.title}</h2><p>{game.description}</p><span className={styles.playLink}>{api.snapshot?.run?.status === "playing" ? "つづきから遊ぶ" : "ゲームで遊ぶ"}<ArrowUpRight size={20} aria-hidden="true" /></span></div>
      </a>
      {api.loading || api.unauthorized || !api.snapshot ? <GameAccessState loading={api.loading} unauthorized={api.unauthorized} error={api.error} onRetry={() => { void api.read(); }} /> : <GameLeaderboard entries={api.snapshot.leaderboard} personalBest={api.snapshot.personalBest} memberId={api.snapshot.member.id} scoreUnit={game.scoreUnit} scoreScale={game.scoreScale} precision={game.precision} />}
    </article>
  );
}

export function GamesPage() {
  const firstGame = GAME_CATALOG[0];
  const api = useGameApi(firstGame.id);
  if (api.loading || api.unauthorized || !api.snapshot) return <GameShell><GameAccessState loading={api.loading} unauthorized={api.unauthorized} error={api.error} onRetry={() => { void api.read(); }} /></GameShell>;
  return (
    <GameShell memberName={api.snapshot.member.name}>
      <div className={styles.hubHeading}><p><Gamepad2 size={18} aria-hidden="true" />YG TEAM ARCADE</p><h1>YG ミニゲーム<span>PLAY. LAUGH. REPEAT.</span></h1><span className={styles.hubDescription}>休憩時間も、チームでひと勝負。</span></div>
      <div className={styles.catalog}><GameCardContent game={firstGame} api={api} />{GAME_CATALOG.slice(1).map((game) => <GameCard key={game.id} game={game} />)}</div>
    </GameShell>
  );
}
