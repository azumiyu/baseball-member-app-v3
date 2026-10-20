"use client";

import { memo, useId, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { ROYALE, type RoyaleState, type RoyaleUnit, type RoyaleEffect } from "@/lib/games/yg-royale";
import { royaleCard, type RoyaleCard } from "@/lib/games/yg-royale-cards";
import styles from "./YgRoyaleArena.module.css";

export type YgRoyaleArenaProps = {
  state: RoyaleState | null;
  selectedCard: RoyaleCard | null;
  active: boolean;
  paused: boolean;
  reducedMotion: boolean;
  onDeploy: (x: number, y: number) => void;
};

const WIDTH = 600;
const HEIGHT = 880;
const DEPLOY = { left: 32, right: 568, top: 500, bottom: 760 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const format = (value: number) => Math.floor(value).toLocaleString("ja-JP");
const canDeploy = (point: { x: number; y: number }) => point.x >= DEPLOY.left && point.x <= DEPLOY.right && point.y >= DEPLOY.top && point.y <= DEPLOY.bottom;

/** Account for the empty margins produced by the SVG's centered `meet` scaling. */
export function royaleArenaCoordinates(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } | null {
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
  const x = (clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale;
  const y = (clientY - rect.top - (rect.height - HEIGHT * scale) / 2) / scale;
  return x >= 0 && x <= WIDTH && y >= 0 && y <= HEIGHT ? { x, y } : null;
}

/** The immutable stonework is shared by every frame; only units and effects redraw. */
const Landscape = memo(function Landscape({ prefix }: { prefix: string }) {
  return <g aria-hidden="true">
    <defs>
      <linearGradient id={`${prefix}-grass`} x2="0" y2="1"><stop stopColor="#24483b" /><stop offset=".5" stopColor="#416f4b" /><stop offset="1" stopColor="#2c5445" /></linearGradient>
      <linearGradient id={`${prefix}-river`} x2="0" y2="1"><stop stopColor="#123b49" /><stop offset=".3" stopColor="#24798a" /><stop offset=".6" stopColor="#3297a0" /><stop offset="1" stopColor="#123f4d" /></linearGradient>
      <linearGradient id={`${prefix}-stone`} x2="0" y2="1"><stop stopColor="#c0c7b2" /><stop offset=".5" stopColor="#929f98" /><stop offset="1" stopColor="#465b60" /></linearGradient>
      <linearGradient id={`${prefix}-bridge`} x2="0" y2="1"><stop stopColor="#d7bb83" /><stop offset="1" stopColor="#8f714c" /></linearGradient>
      <radialGradient id={`${prefix}-light`}><stop stopColor="#ffe0a1" stopOpacity=".19" /><stop offset="1" stopColor="#ffe0a1" stopOpacity="0" /></radialGradient>
      <pattern id={`${prefix}-grass-grid`} width="64" height="64" patternUnits="userSpaceOnUse"><path d="M0 32 32 0 64 32 32 64Z" fill="none" stroke="#d8d9a9" strokeOpacity=".06" /><path d="m17 18 2-5m27 37 4-4" stroke="#a1c88d" strokeOpacity=".3" strokeWidth="2" /></pattern>
      <pattern id={`${prefix}-pavers`} width="56" height="32" patternUnits="userSpaceOnUse"><path d="M0 0h56v32H0z" fill="#869482" fillOpacity=".3" stroke="#152f2d" strokeOpacity=".25" strokeWidth="2" /><path d="M0 1h56" stroke="#dae0b0" strokeOpacity=".1" /></pattern>
      <pattern id={`${prefix}-ripples`} width="180" height="28" patternUnits="userSpaceOnUse"><path d="M-30 13c30-12 50 12 80 0s50 12 80 0 50 12 80 0" fill="none" stroke="#b1eeeb" strokeOpacity=".27" strokeWidth="2" /></pattern>
      <clipPath id={`${prefix}-portrait`}><rect x="-19" y="-47" width="38" height="47" rx="13" /></clipPath>
    </defs>
    <rect width={WIDTH} height={HEIGHT} fill={`url(#${prefix}-grass)`} />
    <rect width={WIDTH} height={HEIGHT} fill={`url(#${prefix}-grass-grid)`} />
    <ellipse cx="300" cy="410" rx="390" ry="520" fill={`url(#${prefix}-light)`} />
    <path d="M266 105h68v230l133 75-21 60-146-78-146 78-21-60 133-75Z" fill={`url(#${prefix}-pavers)`} />
    <path d="M266 775h68V545l133-75-21-60-146 78-146-78-21 60 133 75Z" fill={`url(#${prefix}-pavers)`} />
    {[74, 244, 354, 526, 654, 756].map((y, i) => <g key={y} opacity=".5"><path d={`M${i % 2 ? 45 : 509} ${y}h35l8 17-27 12-22-14Z`} fill="#6c8370" stroke="#b8b98b" strokeOpacity=".35" /><path d={`M${i % 2 ? 48 : 515} ${y + 3}h21`} stroke="#d5d0a0" strokeOpacity=".25" /></g>)}
    {[54, 546].map((x) => <g key={x}><path d={`M${x} 48V831`} stroke="#142c2d" strokeWidth="19" /><path d={`M${x} 48V831`} stroke="#68786a" strokeWidth="13" /><path d={`M${x - 3} 48V831`} stroke="#97a188" strokeOpacity=".55" strokeWidth="2" />{[90, 228, 366, 512, 650, 788].map((y) => <g key={y}><rect x={x - 13} y={y} width="26" height="28" rx="4" fill={`url(#${prefix}-stone)`} stroke="#314c47" strokeWidth="2" /><path d={`M${x - 13} ${y + 6}h26`} stroke="#e1e1bc" strokeOpacity=".55" /></g>)}</g>)}
    <path d="M61 399q98-15 203 0t275 0v82q-112-15-235 0t-243 0Z" fill="#193f3d" />
    <path d="M61 408q98-9 203 0t275 0v64q-112-9-235 0t-243 0Z" fill={`url(#${prefix}-river)`} />
    <path className={styles.water} d="M62 412h477v55H62Z" fill={`url(#${prefix}-ripples)`} />
    <path d="M65 407q100-9 200 0t272 0M65 473q110-9 230 0t242 0" fill="none" stroke="#a4ad85" strokeWidth="3" />
    {[165, 435].map((x) => <g key={x}>
      <path d={`M${x - 45} 403h90l8 78h-106Z`} fill="#142e2d" opacity=".5" transform="translate(4 7)" />
      <path d={`M${x - 40} 402h80l7 75h-94Z`} fill={`url(#${prefix}-bridge)`} stroke="#463e2a" strokeWidth="3" />
      {Array.from({ length: 9 }, (_, n) => <path key={n} d={`M${x - 40 - n / 2} ${407 + n * 8}h${80 + n}`} stroke="#655139" strokeWidth="2" opacity=".72" />)}
      <path d={`M${x - 43} 400l-7 80m93-80 7 80`} stroke="#e6cd94" strokeWidth="7" />
      <path d={`M${x - 45} 400l-7 80m93-80 7 80`} stroke="#7d6140" strokeWidth="2" />
      {[402, 474].flatMap((y) => [-1, 1].map((side) => <g key={`${y}-${side}`}><path d={`M${x + side * 45 - 5} ${y - 10}h10v19h-10Z`} fill={`url(#${prefix}-stone)`} stroke="#45594e" strokeWidth="1.5" /><circle cx={x + side * 45} cy={y - 11} r="5" fill="#dec797" /></g>))}
    </g>)}
    {[110, 490].map((x) => <g key={x} opacity=".85"><path d={`M${x} 150v-50m0 600v50`} stroke="#5a4430" strokeWidth="4" /><path d={`M${x} 102l27 7-27 13Z`} fill="#e77169" /><path d={`M${x} 748l27-7-27-13Z`} fill="#74c2e1" /></g>)}
    <path d="M15 17h570v846H15Z" fill="none" stroke="#14282c" strokeWidth="30" />
    <path d="M23 21h554v838H23Z" fill="none" stroke="#a79161" strokeWidth="3" />
    {[30, 570].flatMap((x) => [28, 852].map((y) => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}><path d="m0-11 11 11L0 11-11 0Z" fill="#b49b62" stroke="#f1d69c" strokeWidth="2" /><path d="m0-4 4 4-4 4-4-4Z" fill="#384f48" /></g>))}
  </g>;
});

function EnemyGate({ prefix }: { prefix: string }) {
  return <g transform="translate(300 85)" aria-hidden="true">
    <ellipse cy="37" rx="84" ry="21" fill="#071d23" opacity=".5" />
    <path d="M-66 38V-18q0-45 66-45t66 45v56Z" fill="#20373b" stroke="#aa9680" strokeWidth="5" />
    <path d="M-48 37V-15q0-32 48-32t48 32v52Z" fill="#091c28" stroke="#6a595d" strokeWidth="4" />
    <path className={styles.portal} d="M-43 36V-12q0-29 43-29t43 29v48Z" fill="#962e5b" fillOpacity=".32" stroke="#f4a88a" strokeOpacity=".55" strokeWidth="2" />
    <path d="M-29 26q40-23 12-50M-4 28q40-23 12-50M22 27q30-19 10-42" fill="none" stroke="#e08eac" strokeOpacity=".35" strokeWidth="3" />
    {[-65, 65].map((x) => <g key={x}><rect x={x - 10} y="-8" width="20" height="47" rx="3" fill={`url(#${prefix}-stone)`} stroke="#435659" strokeWidth="2" /><path d={`M${x - 8} -14h16l-3 15h-10Z`} fill="#b36b4e" /><circle cx={x} cy="-15" r="5" fill="#ffd4a3" /></g>)}
    <text y="-72" textAnchor="middle" fill="#f5cab6" fontSize="13" fontWeight="850" letterSpacing="3">ENEMY GATE</text>
  </g>;
}

function KingTower({ hp, prefix, hit }: { hp: number; prefix: string; hit: boolean }) {
  const color = "#66b8e6";
  return <g transform="translate(300 810)" className={hit ? styles.towerHit : ""} aria-hidden="true">
    <ellipse cy="29" rx="77" ry="22" fill="#061c24" opacity=".4" />
    <path d="m-70 17 20-49h100l20 49-19 26H-50Z" fill="#7b8a81" stroke="#2b474a" strokeWidth="3" />
    <path d="m-54-27 6 60H48l6-60" fill={`url(#${prefix}-stone)`} stroke="#d0d0b0" strokeWidth="2" />
    <path d="M-49-17h98M-51 1H51M-48 20h96M0-17V0m-25 0v20m50-20v20" fill="none" stroke="#405855" strokeWidth="2" opacity=".5" />
    {[-51, 51].map((x) => <g key={x}><path d={`M${x - 15} -35h8v8h13v-8h9v42h-30Z`} fill={`url(#${prefix}-stone)`} stroke="#364d4d" strokeWidth="2" /><path d={`M${x - 12} -20h24v12h-24Z`} fill={color} opacity=".8" /><rect x={x - 3} y="-13" width="6" height="12" rx="3" fill="#183c49" /></g>)}
    <path d="M-31-20v-27l13 9 18-19 18 19 13-9v27Z" fill="#d9b863" stroke="#fff0ad" strokeWidth="2" />
    <path d="M-27-20h54v10h-54Z" fill="#8c6533" stroke="#f9de98" strokeWidth="2" />
    <path d="m0-48 4 7-4 5-4-5Z" fill={color} stroke="#ffefb4" />
    <path d="M-21-7h42V26l-21 12-21-12Z" fill={color} stroke="#e8dfbc" strokeWidth="2" />
    <text y="17" textAnchor="middle" fill="#fff5d8" fontSize="20" fontWeight="950" fontFamily="serif">YG</text>
    <rect x="-64" y="-80" width="128" height="13" rx="6.5" fill="#102a2e" stroke="#e1d3a5" strokeWidth="1.5" />
    <rect x="-62" y="-78" width={124 * clamp(hp / ROYALE.maxHp, 0, 1)} height="9" rx="4.5" fill={color} />
    <text y="-89" textAnchor="middle" fill="#fff8dd" fontSize="16" fontWeight="850" stroke="#0c2530" strokeWidth="3" paintOrder="stroke">{`${format(hp)} / ${format(ROYALE.maxHp)}`}</text>
    <text y="53" textAnchor="middle" fill="#c9dce0" fontSize="11" fontWeight="850" letterSpacing="3">YOUR TOWER</text>
  </g>;
}

function CharacterWeapon({ card, attacking }: { card: RoyaleCard; attacking: boolean }) {
  if (card.trait === "charge") return <g className={attacking ? styles.weaponAttack : ""}><path d="M19 0 45-39" stroke="#a47443" strokeWidth="4" /><path d="m40-31 4-15 7 7Z" fill="#f1e8bf" stroke="#687d8c" strokeWidth="1.5" /><ellipse cx="30" cy="-5" rx="11" ry="6" fill="#dfba72" stroke="#fff2b8" strokeWidth="1.5" /><path d="M19-5q11 22 22 0" fill="#f5e8ca" stroke="#8c693b" strokeWidth="1.5" /></g>;
  if (card.trait === "shield") return <g><path d="m15-8 18-7 8 7-3 23-10 6-12-9Z" fill="#a2bdd3" stroke="#f5e8bd" strokeWidth="2" /><path d="m26-8 6 2-2 18-5-4Z" fill="#e4cf88" /></g>;
  if (card.range >= 100) return <g className={attacking ? styles.weaponAttack : ""}><path d="m19 10 15-48" stroke="#997342" strokeWidth="4" /><path d="m31-32-5-10 12-9 8 12-7 8Z" fill={card.color} stroke="#fff5bf" strokeWidth="2" /><path d="m35-45 4 9" stroke="#fff" strokeWidth="2" />{card.splash > 0 && <circle cx="40" cy="-42" r="4" fill="#fff5b3" opacity=".9" />}</g>;
  return <g className={attacking ? styles.weaponAttack : ""}><path d="m21 7 10-23" stroke="#70503d" strokeWidth="5" /><path d="m27-12 3-23 9-2 2 11-9 18Z" fill="#dce7e5" stroke="#6f8a9a" strokeWidth="2" /><path d="m22-9 13 5" stroke="#f6d384" strokeWidth="4" /></g>;
}

function Character({ unit, tick, prefix, reducedMotion }: { unit: RoyaleUnit; tick: number; prefix: string; reducedMotion: boolean }) {
  const card = royaleCard(unit.cardId);
  const enemy = unit.side === "enemy";
  const scale = clamp(card.radius / 20, .7, 1.27);
  const flying = card.air;
  const hit = unit.hitUntil > tick;
  const attacking = unit.attackUntil > tick;
  const slow = unit.slowUntil > tick;
  const scaleImage = card.imageScale ?? 1;
  const imageWidth = 38 * scaleImage;
  const imageX = card.objectPosition?.startsWith("left") ? -19 : -imageWidth / 2;
  return <g transform={`translate(${unit.x.toFixed(2)} ${unit.y.toFixed(2)})`} className={styles.unit} data-enemy={enemy || undefined} data-flying={flying || undefined} data-hit={hit || undefined} data-slow={slow || undefined} style={{ "--unit-color": card.color } as CSSProperties} aria-hidden="true">
    <ellipse cy="7" rx={24 * scale} ry={8 * scale} fill="#06171b" opacity={flying ? .2 : .35} />
    <g transform={`translate(0 ${flying ? -15 : 0}) scale(${scale})`}>
      <g className={!reducedMotion && tick - unit.spawnTick < 6 ? styles.unitSpawn : undefined}>
        {flying && <path className={styles.unitWings} d="M-13-18C-38-24-45-42-44-54c-13 14-14 36 6 46l22 10M13-18C38-24 45-42 44-54c13 14 14 36-6 46L16 2" fill={card.color} fillOpacity=".85" stroke="#e6faff" strokeWidth="2" />}
        <path d="M-14-13-23 17 0 12l23 5-9-30Z" fill={enemy ? "#b84946" : "#3579a6"} stroke="#172d39" strokeWidth="2" />
        <path d="m-15-10-6 20h42l-6-20Z" fill={card.color} stroke="#f4deb0" strokeWidth="2" />
        <path d="M-8-6V7m16-13V7" stroke="#fff6d5" strokeOpacity=".45" strokeWidth="2" />
        <path d="m-12 11-5 9m29-9 5 9" stroke="#243642" strokeWidth="8" strokeLinecap="round" />
        <rect x="-21" y="-49" width="42" height="51" rx="15" fill={enemy ? "#c96357" : "#7fc8e8"} stroke="#fff0ba" strokeWidth="2" />
        <g clipPath={`url(#${prefix}-portrait)`}><image href={card.image} x={imageX} y="-47" width={imageWidth} height="47" preserveAspectRatio={card.objectPosition?.startsWith("left") ? "xMinYMid slice" : "xMidYMid slice"} /><path d="M-20-5h40v8h-40Z" fill="#142c3d" opacity=".24" /></g>
        {card.cost >= 6 && <path d="m-20-43-5-13 12 3 13-10 13 10 12-3-5 13Z" fill="#ead17d" stroke="#fff1bc" strokeWidth="1.5" />}
        <CharacterWeapon card={card} attacking={attacking} />
        <ellipse cy="19" rx="22" ry="7" fill="none" stroke={enemy ? "#ff9381" : "#76ddff"} strokeWidth="3" opacity=".95" />
        {unit.shield > 0 && <ellipse cy="-14" rx="28" ry="39" fill="#a4e8ff" fillOpacity=".08" stroke="#bdefff" strokeWidth="2" strokeDasharray="9 4" />}
        {slow && <g stroke="#b5fbff" strokeWidth="2"><path d="M-18 9h36M-12 16h24m-6-6-4 12m-6-12 4 12" /><path d="M-23-27h-8m4-4v8m49-5h8m-4-4v8" /></g>}
        <rect x="-23" y="-64" width="46" height="6" rx="3" fill="#10252e" stroke="#c3cab8" strokeWidth=".8" />
        <rect x="-22" y="-63" width={44 * clamp(unit.hp / unit.maxHp, 0, 1)} height="4" rx="2" fill={enemy ? "#ff8a79" : "#79e4aa"} />
        {flying && <text y="-69" textAnchor="middle" fill="#e3faff" fontSize="11" fontWeight="800">飛</text>}
      </g>
    </g>
  </g>;
}

function BattleEffect({ effect, tick, reducedMotion }: { effect: RoyaleEffect; tick: number; reducedMotion: boolean }) {
  const progress = clamp((tick - effect.tick) / Math.max(1, effect.until - effect.tick), 0, 1);
  const color = effect.side === "player" ? "#c5f7ff" : "#ffb891";
  if (effect.kind === "wave") return null;
  if (effect.kind === "projectile") {
    const x = effect.x + ((effect.tx ?? effect.x) - effect.x) * progress;
    const y = effect.y + ((effect.ty ?? effect.y) - effect.y) * progress - (reducedMotion ? 0 : Math.sin(progress * Math.PI) * 19);
    return <g aria-hidden="true"><path d={`M${effect.x} ${effect.y} ${x} ${y}`} stroke={color} strokeWidth="2" strokeOpacity=".28" strokeDasharray="4 7" /><circle cx={x} cy={y} r={effect.cardId?.includes("bomber") ? 7 : 4} fill={effect.cardId?.includes("sinker") ? "#8afff0" : color} stroke="#fff6c9" strokeWidth="1.5" />{!reducedMotion && <circle cx={x} cy={y} r="10" fill={color} opacity=".15" />}</g>;
  }
  const opacity = reducedMotion ? .5 : 1 - progress;
  const radius = effect.kind === "burst" ? 12 + progress * 63 : effect.kind === "deploy" ? 15 + progress * 27 : effect.kind === "death" ? 4 + progress * 22 : 5 + progress * 17;
  return <g transform={`translate(${effect.x} ${effect.y})`} opacity={opacity} aria-hidden="true">
    {(effect.kind === "burst" || effect.kind === "deploy") && <><ellipse rx={radius} ry={radius * .5} fill={color} fillOpacity=".12" stroke={color} strokeWidth={effect.kind === "burst" ? 4 : 2} /><ellipse rx={radius * .73} ry={radius * .37} fill="none" stroke="#fff1ad" strokeWidth="1.5" />{effect.kind === "deploy" && <path d="M-19 0 0-12 19 0 0 12Z" fill="none" stroke="#fff4b2" strokeWidth="2" />}</>}
    {effect.kind === "hit" && <path d={`M-${radius} -${radius / 2} ${radius} ${radius / 2}M-${radius / 2} ${radius} ${radius / 2} -${radius}M-${radius} ${radius / 2} ${radius} -${radius / 2}`} stroke="#fff3ba" strokeWidth="3" />}
    {effect.kind === "tower" && <><circle r={radius * 1.8} fill="#fff1bc" opacity=".22" /><path d="m-22-7 15-2 7-17 7 17 15 2-12 11 3 17L0 13-13 21l3-17Z" fill="#fff5bf" /></>}
    {effect.kind === "death" && <>{[-1, 1].flatMap((x) => [-1, 1].map((y) => <path key={`${x}-${y}`} d={`M${x * radius} ${y * radius - 4}l4 4-4 4-4-4Z`} fill={color} />))}</>}
    {effect.kind === "death" && effect.side === "enemy" && Boolean(effect.amount) && <text y={-25 - progress * 23} textAnchor="middle" fill="#ffe29d" stroke="#213536" strokeWidth="3" paintOrder="stroke" fontSize="20" fontWeight="950">+{format(effect.amount!)} pt</text>}
    {effect.kind === "dodge" && <text y={-20 - progress * 12} textAnchor="middle" fill="#fff6b8" fontSize="15" fontWeight="900">スルー！</text>}
    {effect.amount !== undefined && effect.amount > 0 && effect.kind !== "deploy" && effect.kind !== "death" && <text y={-27 - progress * 22} textAnchor="middle" fill={effect.kind === "tower" ? "#fff0a1" : "#fff9e7"} stroke="#213536" strokeWidth="3" paintOrder="stroke" fontSize={effect.kind === "tower" ? 24 : 17} fontWeight="950">{effect.kind === "tower" ? "+" : ""}{format(effect.amount)}</text>}
  </g>;
}

export function YgRoyaleArena({ state, selectedCard, active, paused, reducedMotion, onDeploy }: YgRoyaleArenaProps) {
  const prefix = `royale-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [cursor, setCursor] = useState({ x: 165, y: 650 });
  const [hovering, setHovering] = useState(false);
  const tick = state?.tick ?? 0;
  const hp = state?.playerHp ?? ROYALE.maxHp;
  const units = state?.units ?? [];
  const effects = state?.effects ?? [];
  const available = active && !paused && Boolean(selectedCard);
  const canAfford = !state || !selectedCard || state.elixir >= selectedCard.cost;
  const validCursor = canDeploy(cursor);
  const ownTowerHit = effects.some((effect) => effect.kind === "tower" && effect.side === "enemy");
  const waveEffect = effects.findLast((effect) => effect.kind === "wave");

  function position(event: MouseEvent<SVGSVGElement>) {
    return royaleArenaCoordinates(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }
  function deploy(event: MouseEvent<SVGSVGElement>) {
    if (!available || !canAfford) return;
    const point = event.detail === 0 ? cursor : position(event);
    if (!point) return;
    setCursor(point);
    // The replay protocol uses integer world positions; normalize before checking
    // its bounds so exact edge taps survive subpixel scaling on mobile screens.
    const deployment = { x: Math.round(point.x), y: Math.round(point.y) };
    if (canDeploy(deployment)) onDeploy(deployment.x, deployment.y);
  }
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (!available) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (canAfford && canDeploy(cursor)) onDeploy(Math.round(cursor.x), Math.round(cursor.y));
    } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setHovering(true);
      const step = event.shiftKey ? 60 : 25;
      setCursor((previous) => ({ x: event.key === "Home" ? 165 : event.key === "End" ? 435 : clamp(previous.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), DEPLOY.left, DEPLOY.right), y: clamp(previous.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), DEPLOY.top, DEPLOY.bottom) }));
    }
  }

  return <div className={styles.arena} data-paused={paused || undefined} data-reduced={reducedMotion || undefined} data-selecting={available || undefined}>
    <svg className={styles.battlefield} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="YGクラロワの防衛戦。自分のタワーを守り、敵を撃破してポイント獲得。カード選択後、自陣の青い範囲をタップして出撃。キーボードは矢印キーで位置調整、Enterで出撃、HomeとEndで左右のレーンを選択。" tabIndex={active ? 0 : -1} onClick={deploy} onKeyDown={keyboard} onFocus={() => setHovering(true)} onBlur={() => setHovering(false)} onMouseMove={(event) => { if (available) { const point = position(event); if (point) setCursor(point); setHovering(Boolean(point)); } }} onMouseLeave={() => setHovering(false)}>
      <Landscape prefix={prefix} />
      {available && <g aria-hidden="true"><rect x="32" y="500" width="536" height="260" rx="15" fill={canAfford ? "#7fc9ff" : "#f0b274"} fillOpacity=".1" stroke={canAfford ? "#a3e3ff" : "#f3bc8c"} strokeOpacity=".5" strokeDasharray="7 7" strokeWidth="2" /><text x="300" y="526" textAnchor="middle" fill="#ddf6ff" fontSize="15" fontWeight="700" opacity=".8">{canAfford ? "この範囲にタップして出撃" : "エリクサーをためよう"}</text><path d="M165 546v-53m270 53v-53" stroke="#e4f6df" strokeWidth="3" strokeDasharray="5 6" opacity=".4" /></g>}
      <EnemyGate prefix={prefix} />
      <KingTower hp={hp} prefix={prefix} hit={ownTowerHit} />
      {effects.filter((effect) => effect.kind === "deploy" || effect.kind === "death" || effect.kind === "burst").map((effect) => <BattleEffect key={effect.id} effect={effect} tick={tick} reducedMotion={reducedMotion} />)}
      {[...units].sort((a, b) => Number(royaleCard(a.cardId).air) - Number(royaleCard(b.cardId).air) || a.y - b.y).map((unit) => <Character key={unit.id} unit={unit} tick={tick} prefix={prefix} reducedMotion={reducedMotion} />)}
      {effects.filter((effect) => effect.kind !== "deploy" && effect.kind !== "death" && effect.kind !== "burst").map((effect) => <BattleEffect key={effect.id} effect={effect} tick={tick} reducedMotion={reducedMotion} />)}
      {available && hovering && selectedCard && <g transform={`translate(${cursor.x} ${cursor.y})`} pointerEvents="none" aria-hidden="true" opacity={validCursor && canAfford ? 1 : .5}>
        <circle r={Math.min(205, selectedCard.range)} fill={validCursor ? "#a9e8ff" : "#ff8e7c"} fillOpacity=".06" stroke={validCursor ? "#d8f8ff" : "#ff9a88"} strokeWidth="1.5" strokeDasharray="6 6" />
        <ellipse rx={Math.max(23, selectedCard.radius + 7)} ry="14" fill={validCursor ? "#99e6ff" : "#ff8270"} fillOpacity=".15" stroke={validCursor ? "#d2f6ff" : "#ff8e7c"} strokeWidth="3" />
        <path d="M-9 0H9M0-9V9" stroke="#fff6ce" strokeWidth="2" />
        <rect x="-53" y="23" width="106" height="26" rx="13" fill="#102b3b" fillOpacity=".9" stroke="#8fccde" /><text y="41" textAnchor="middle" fill="#f6f8e8" fontSize="14" fontWeight="750">{selectedCard.shortName} · {selectedCard.cost}</text>
      </g>}
    </svg>
    {!active && !state && <div className={styles.idleCrest} aria-hidden="true"><svg viewBox="0 0 100 80"><path d="m17 35-7-23 23 12L50 4l17 20 23-12-7 23v30H17Z" fill="#d9ba76" stroke="#fff2b9" strokeWidth="2" /><path d="M22 42h56v19H22Z" fill="#283f42" /><path d="m50 18 7 13-7 10-7-10Z" fill="#e8edb0" /></svg><span>ENDLESS DEFENSE</span><strong>YG ROYALE</strong><p>仲間を呼べ。タワーを守れ。</p></div>}
    {active && !paused && waveEffect && <div key={waveEffect.id} className={styles.wave} aria-hidden="true"><span>ENEMY REINFORCEMENT</span><strong>敵の増援！</strong><i>止まらない、次の波。</i></div>}
    {paused && <div className={styles.pauseVeil} aria-hidden="true"><span>Ⅱ</span><strong>作戦休憩中</strong><small>戦場はそのまま。次の一手を考えよう。</small></div>}
  </div>;
}
