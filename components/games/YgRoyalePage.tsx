"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clock3, Crown, Droplet, Pause, Play, RotateCcw, Shield, Swords, Trophy, Users, Zap } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { ROYALE, royaleDifficulty } from "@/lib/games/yg-royale";
import { ROYALE_CARDS, ROYALE_DEFAULT_DECK, royaleCard, type RoyaleCard } from "@/lib/games/yg-royale-cards";
import { GameAccessState, GameShell } from "./GameShell";
import { GameLeaderboard } from "./GameLeaderboard";
import { YgRoyaleArena } from "./YgRoyaleArena";
import { YgRoyalePortrait } from "./YgRoyalePortrait";
import { YgRoyaleMatchups } from "./YgRoyaleMatchups";
import { useYgRoyaleGame } from "./useYgRoyaleGame";
import styles from "./YgRoyalePage.module.css";

const number = (value: number) => Math.floor(value).toLocaleString("ja-JP");
const time = (tick: number) => {
  const seconds = Math.floor(tick * ROYALE.stepMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
function CardInfo({ card }: { card: RoyaleCard }) {
  return <div className={styles.cardInfo} style={{ "--card-color": card.color } as CSSProperties}>
    <span className={styles.infoCost}><Droplet size={13} aria-hidden="true" />{card.cost}</span>
    <div><strong>{card.name}</strong><span>{card.role} <i />{card.badge}</span><p>{card.description}</p></div>
  </div>;
}

export function YgRoyalePage() {
  const game = useYgRoyaleGame();
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [inspected, setInspected] = useState<string | null>(null);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const roster = useRef<HTMLDetailsElement>(null);
  const battle = useRef<HTMLElement>(null);
  const { api, state, playing, ended } = game;
  const deck = draft ?? state?.deck ?? [...ROYALE_DEFAULT_DECK];
  const hand = state?.hand ?? deck.slice(0, 4);
  const selectedCard = hand[selected] ? royaleCard(hand[selected]) : null;
  const difficulty = royaleDifficulty(state?.tick ?? 0);
  const elixir = state?.elixir ?? 7;
  const hp = state?.playerHp ?? ROYALE.maxHp;
  const score = state?.score ?? 0;
  const battleMode = !!api.snapshot && !api.unauthorized && !!state && !ended && !referenceOpen;
  const canStart = !api.busy && !api.retryPending && !game.awaitingSave && deck.length === 8 && (!state || (ended && game.saved));
  const canResume = !!state && !ended && !playing && !api.busy && !api.retryPending && !game.awaitingSave;
  const editDeck = !playing && (!state || ended);
  const inspectedCard = royaleCard(inspected ?? selectedCard?.id ?? ROYALE_DEFAULT_DECK[0]);
  const averageCost = deck.length ? (deck.reduce((total, id) => total + royaleCard(id).cost, 0) / deck.length).toFixed(1) : "0.0";

  useEffect(() => {
    if (referenceOpen) roster.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [referenceOpen]);

  useEffect(() => {
    if (!battleMode || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 760px), (max-height: 500px) and (orientation: landscape)");
    const previous = document.body.style.overflow;
    const sync = () => { document.body.style.overflow = media.matches ? "hidden" : previous; };
    sync();
    media.addEventListener("change", sync);
    return () => { media.removeEventListener("change", sync); document.body.style.overflow = previous; };
  }, [battleMode]);

  useEffect(() => {
    if (ended && !referenceOpen) battle.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [ended, referenceOpen]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select"))) return;
      if (/^Digit[1-4]$/.test(event.code)) { event.preventDefault(); setSelected(Number(event.code.slice(-1)) - 1); }
      else if (event.code === "KeyP" && playing) { event.preventDefault(); game.pause(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [playing, game.pause]);

  function deploy(x: number, y: number) { return game.deploy(selected, x, y); }
  function openReference() { game.pause(); setReferenceOpen(true); }
  function returnToBattle() { setReferenceOpen(false); game.resume(); }
  function toggleCard(id: string) {
    setInspected(id);
    if (!editDeck) return;
    setDraft(current => {
      const next = current ?? [...deck];
      return next.includes(id) ? next.filter(card => card !== id) : next.length < 8 ? [...next, id] : next;
    });
  }

  if (api.loading || api.unauthorized || !api.snapshot) return <GameShell isGame><GameAccessState loading={api.loading} unauthorized={api.unauthorized} error={api.error} onRetry={() => { void api.read(); }} /></GameShell>;

  return <GameShell isGame memberName={api.snapshot.member.name}>
    <div className={styles.game} data-playing={playing} data-ended={!!ended} data-battle-mode={battleMode}>
      <header className={styles.heading}>
        <div><span className={styles.brandCrown}><Crown size={21} aria-hidden="true" /></span><p>YG TEAM ARENA <small>ENDLESS DEFENSE</small></p></div>
        <h1>YG<span>クラロワ</span><small>自陣を守れ。仲間の相性で、大群を撃破。</small></h1>
        <span className={styles.modeBadge}><Shield size={13} aria-hidden="true" />エンドレス防衛戦</span>
      </header>

      <section className={styles.battle} ref={battle} aria-label="YGクラロワ バトル">
        <div className={styles.scoreboard}>
          <div className={styles.damage}><span><Swords size={12} aria-hidden="true" />撃破ポイント</span><strong>{number(score)}<small>pt</small></strong></div>
          <div className={styles.battleTime}><span><Clock3 size={11} aria-hidden="true" />生存時間</span><strong>{time(state?.tick ?? 0)}</strong><small>WAVE {difficulty.level}</small></div>
          <button type="button" className={styles.referenceButton} onClick={openReference} aria-label="休憩してキャラクター図鑑と相性表を見る"><BookOpen size={16} aria-hidden="true" /><span>図鑑・相性</span></button>
        </div>
        <div className={styles.pressure}><span><i />WAVE {difficulty.level} · {difficulty.label}</span><small>{playing ? `${number(state?.kills ?? 0)}体撃破` : ended ? "BATTLE OVER" : "タワーを守って、敵を撃破"}</small></div>

        <div className={styles.arenaWrap}>
          <YgRoyaleArena state={state} selectedCard={selectedCard} active={playing} paused={!!state && !playing && !ended} onDeploy={deploy} reducedMotion={reducedMotion} />
          {!playing && <div className={styles.battleOverlay}>
            {ended ? <>
              <span className={styles.overlayEmblem}><Trophy size={28} aria-hidden="true" /></span><small>YOUR DEFENSE RECORD</small><h2>ナイス防衛！</h2><strong>{number(score)}<span>撃破ポイント</span></strong><p>{game.saved ? "記録をランキングに反映しました。" : game.awaitingSave ? "記録を保存しています…" : "記録の保存を確認しています。"}</p>
              <div className={styles.endStats}><span>生存 <b>{time(state?.tick ?? 0)}</b></span><span>撃破 <b>{number(state?.kills ?? 0)}</b></span><span>出撃 <b>{number(state?.deployments ?? 0)}</b></span></div>
              <button type="button" disabled={!canStart} onClick={() => { setSelected(0); setReferenceOpen(false); void game.start(deck); }}><RotateCcw size={15} aria-hidden="true" />もう一度出撃</button>
            </> : state ? <>
              <span className={styles.overlayEmblem}><Pause size={26} aria-hidden="true" /></span><small>BATTLE PAUSED</small><h2>作戦、立て直そう。</h2><p>部隊とコストの時間は止まっています。</p><button type="button" disabled={!canResume} onClick={returnToBattle}><Play size={15} fill="currentColor" aria-hidden="true" />バトルを再開</button>
            </> : <>
              <span className={styles.overlayEmblem}><Crown size={28} aria-hidden="true" /></span><small>YOUR TEAM. YOUR STRATEGY.</small><h2>全員で、守り抜け。</h2><p>強い敵ほど、撃破ポイントも大きい。<br />押し寄せる部隊をさばいて、自己ベストへ。</p><div className={styles.startFaces}>{ROYALE_DEFAULT_DECK.slice(0, 3).map(id => <YgRoyalePortrait key={id} card={royaleCard(id)} small />)}</div><button type="button" disabled={!canStart} onClick={() => { setSelected(0); setReferenceOpen(false); void game.start(deck); }}><Play size={15} fill="currentColor" aria-hidden="true" />{api.busy ? "部隊を編成中…" : "バトル開始"}</button><span className={styles.startHint}>8枚のデッキを下で編集できます</span>
            </>}
          </div>}
        </div>

        <div className={styles.playerBar}><span><Shield size={13} aria-hidden="true" />自陣キング</span><div className={styles.towerHealth} role="meter" aria-label="自陣キングタワーのHP" aria-valuenow={Math.ceil(hp)} aria-valuemin={0} aria-valuemax={ROYALE.maxHp}><i style={{ width: `${Math.max(0, hp / ROYALE.maxHp * 100)}%` }} /></div><strong>{number(hp)}<small> / {number(ROYALE.maxHp)}</small></strong>{playing && <button type="button" onClick={game.pause} aria-label="バトルを一時停止"><Pause size={14} aria-hidden="true" /></button>}</div>

        <div className={styles.commandDeck}>
          <div className={styles.elixirHeading}><span><Droplet size={14} aria-hidden="true" />エリクサー<strong>{elixir.toFixed(1)}<small>/ 10</small></strong></span><small>+{difficulty.elixirPerSecond.toFixed(1)} / 秒</small><span className={styles.checkpoint} data-saving={game.awaitingSave}>{game.awaitingSave ? "保存中" : "AUTO SAVE"}<i /></span></div>
          <div className={styles.elixirBar} role="meter" aria-label="エリクサー" aria-valuenow={Number(elixir.toFixed(1))} aria-valuemin={0} aria-valuemax={ROYALE.maxElixir}><i style={{ width: `${elixir / ROYALE.maxElixir * 100}%` }} />{Array.from({ length: 9 }, (_, index) => <b key={index} style={{ left: `${(index + 1) * 10}%` }} />)}</div>
          <div className={styles.hand} aria-label="4枚の手札">
            {hand.map((id, slot) => {
              const card = royaleCard(id);
              return <button type="button" key={slot} className={styles.handCard} data-selected={selected === slot} data-affordable={elixir >= card.cost} aria-pressed={selected === slot} aria-label={`${slot + 1}枚目 ${card.name}、${card.cost}コスト、${card.role}${elixir < card.cost ? "、エリクサー不足" : ""}`} onClick={() => { setSelected(slot); setInspected(id); }} style={{ "--card-color": card.color } as CSSProperties}>
                <YgRoyalePortrait card={card} small /><span className={styles.cost}>{card.cost}</span><kbd>{slot + 1}</kbd><strong>{card.shortName}</strong><small>{card.role}</small>
              </button>;
            })}
            <div className={styles.nextCard}><span>NEXT</span>{state?.queue[0] ? <><YgRoyalePortrait card={royaleCard(state.queue[0])} small /><small>{royaleCard(state.queue[0]).cost}</small></> : <span><ArrowDown size={14} aria-hidden="true" /></span>}</div>
          </div>
          {(game.notice || api.error) ? <p className={styles.battleNotice} role="status">{game.notice || api.error}<button type="button" disabled={api.busy} onClick={() => { void game.retry(); }}>再送</button></p> : selectedCard && <CardInfo card={selectedCard} />}
          <div className={styles.deployButtons}><button type="button" disabled={!playing || !selectedCard || elixir < selectedCard.cost} onClick={() => deploy(165, 640)}><ArrowLeft size={14} aria-hidden="true" />左レーンに配置</button><button type="button" disabled={!playing || !selectedCard || elixir < selectedCard.cost} onClick={() => deploy(435, 640)}>右レーンに配置<ArrowRight size={14} aria-hidden="true" /></button></div>
          <p className={styles.commandHint} role="status" aria-live="polite">{game.inputNotice || (playing ? "カードを選ぶ → 自陣の好きな位置をタップ。" : ended ? "次の編成を考えて、もう一度挑戦。" : "敵に合わせて、出すカードと位置を選ぼう。")}</p>
        </div>
      </section>

      {(api.error || game.notice) && <div className={styles.notice} role="alert"><p>{game.notice || api.error}</p><button type="button" disabled={api.busy} onClick={() => { void game.retry(); }}><RotateCcw size={14} aria-hidden="true" />保存を再試行・再読み込み</button></div>}

      {referenceOpen && state && !ended && <div className={styles.returnBar}><span>図鑑を確認中 · バトルは休憩中</span><button type="button" disabled={!canResume} onClick={returnToBattle}><Play size={14} aria-hidden="true" />バトルに戻る</button></div>}
      <details className={styles.roster} ref={roster} open={referenceOpen || undefined}>
        <summary><span><Users size={17} aria-hidden="true" />{editDeck ? "出撃デッキを編成" : "キャラクター図鑑"}<b>{editDeck ? `${deck.length} / 8` : `${ROYALE_CARDS.length}人`}</b></span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className={styles.rosterBody}><div className={styles.rosterHeading}><p>{editDeck ? "8人の仲間を選ぼう。選んだ順で最初の手札が決まります。" : "次の敵に、誰を当てる？カードを押すと特徴を確認できます。"}</p><span>平均コスト <b>{averageCost}</b></span></div>
          {editDeck && deck.length !== 8 && <p className={styles.deckWarning}>あと{Math.max(0, 8 - deck.length)}枚選ぶと出撃できます。入れ替えるときは、先に1枚外してください。</p>}
          <div className={styles.rosterGrid}>{ROYALE_CARDS.map(card => <button type="button" key={card.id} data-in-deck={deck.includes(card.id)} data-inspected={inspected === card.id} onClick={() => toggleCard(card.id)} aria-pressed={deck.includes(card.id)} aria-label={`${card.name}、${card.cost}コスト、${deck.includes(card.id) ? "デッキに編成中" : "未編成"}`} style={{ "--card-color": card.color } as CSSProperties}><YgRoyalePortrait card={card} small /><span className={styles.cost}>{card.cost}</span>{deck.includes(card.id) && <span className={styles.deckCheck}><Check size={10} aria-hidden="true" /></span>}<strong>{card.shortName}</strong><small>{card.role}</small></button>)}</div>
          <CardInfo card={inspectedCard} />
          <p className={styles.killReward}>この敵を1体撃破すると <strong>{inspectedCard.killPoints} pt</strong></p>
          <YgRoyaleMatchups card={inspectedCard} />
          {editDeck && <div className={styles.rosterActions}><button type="button" onClick={() => setDraft([...ROYALE_DEFAULT_DECK])}>おすすめ8枚に戻す</button><button type="button" disabled={!canStart} onClick={() => { setSelected(0); setReferenceOpen(false); void game.start(deck); }}><Swords size={14} aria-hidden="true" />このデッキで出撃</button></div>}
        </div>
      </details>

      <details className={styles.guide} open={!state || undefined}><summary><span><Shield size={16} aria-hidden="true" />タワーを守って、撃破を重ねるコツ</span><ChevronDown size={16} aria-hidden="true" /></summary><div>
        <ol><li><b>01</b><p><strong>ためて、出して、回す。</strong><span>エリクサーは時間で回復。8枚のデッキから4枚が手札に。出すと次のカードが手札に入ります。</span></p></li><li><b>02</b><p><strong>相性で、押し返す。</strong><span>群れには範囲攻撃。飛行部隊には対空。前衛の後ろから遠距離で援護し、自陣タワーと一緒に敵を処理しよう。</span></p></li><li><b>03</b><p><strong>強敵の撃破で、大きく稼ぐ。</strong><span>倒した敵1体ごとにポイントを加算。強いキャラほど高得点です。自陣のHPが0になるまでの合計ポイントを競います。</span></p></li></ol>
        <div className={styles.dangerNote}><Zap size={17} aria-hidden="true" /><p>時間とともに敵の数・体力・攻撃力が上昇。最後は怒涛の大群が押し寄せます。<span>非表示中は進行を止め、表示すると再開します。休憩ボタンで止めた場合は、再開ボタンを押してください。</span></p></div>
        <p className={styles.keyboardNote}>キーボード：1〜4で手札を選択。戦場にフォーカスして矢印で配置位置、Enterで出撃。Pで休憩。</p>
      </div></details>

      {!playing && <GameLeaderboard entries={api.snapshot.leaderboard} personalBest={api.snapshot.personalBest} memberId={api.snapshot.member.id} scoreUnit="pt" />}
      <p className={styles.footnote}>写真の仲間たちによる、YGオリジナルのタワー防衛ゲーム。</p>
    </div>
  </GameShell>;
}
