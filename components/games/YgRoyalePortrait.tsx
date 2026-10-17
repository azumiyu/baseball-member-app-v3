/* eslint-disable @next/next/no-img-element -- Local team photographs supplied for the minigames. */
import type { CSSProperties } from "react";
import type { RoyaleCard } from "@/lib/games/yg-royale-cards";
import styles from "./YgRoyalePortrait.module.css";

export function YgRoyalePortrait({ card, className = "", small = false }: { card: RoyaleCard; className?: string; small?: boolean }) {
  const photoStyle: CSSProperties = { objectPosition: card.objectPosition ?? "center 35%", transform: `scale(${card.imageScale ?? 1})`, transformOrigin: card.objectPosition ?? "center" };
  const insignia = card.air ? "↟" : card.trait === "charge" ? "ϟ" : card.trait === "shield" ? "◆" : card.splash > 0 ? "✦" : card.hp >= 2000 ? "♜" : "YG";
  return <span className={`${styles.portrait} ${className}`} data-small={small || undefined} data-air={card.air || undefined} style={{ "--portrait-color": card.color } as CSSProperties} aria-hidden="true">
    <span className={styles.rays} />
    {card.air && <svg className={styles.wings} viewBox="0 0 100 100"><path d="M35 66C11 49 11 23 3 15c3 27 0 46 24 65l14-6m24-8c24-17 24-43 32-51-3 27 0 46-24 65l-14-6" fill="#e1faff" stroke="#8ad9ff" strokeWidth="2" /></svg>}
    <span className={styles.photo}><img src={card.image} alt="" decoding="async" loading="lazy" draggable={false} style={photoStyle} /></span>
    <svg className={styles.frame} viewBox="0 0 100 120" preserveAspectRatio="none"><path d="M8 14 20 4h60l12 10v85l-13 16H21L8 99Z" fill="none" stroke="currentColor" strokeWidth="3" /><path d="m33 8 4-8 13 7L63 0l4 8M12 99l12 12m64-12-12 12" fill="none" stroke="#fff4c4" strokeWidth="2" /><path d="M30 112h40l-5 6H35Z" fill="#f4ca78" /></svg>
    {!small && <span className={styles.insignia}>{insignia}</span>}
    <span className={styles.glint} />
  </span>;
}
