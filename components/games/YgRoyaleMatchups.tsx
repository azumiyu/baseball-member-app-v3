"use client";

import { memo } from "react";
import { ROYALE_CARDS, type RoyaleCard } from "@/lib/games/yg-royale-cards";
import { royaleMatchup, royaleMatchups } from "@/lib/games/yg-royale-matchups";
import styles from "./YgRoyalePage.module.css";

const labels = { strong: "有利", weak: "不利", even: "互角" };
const symbols = { strong: "○", weak: "△", even: "・" };

/** Card objects are immutable, so live battle frames never rebuild this table. */
export const YgRoyaleMatchups = memo(function YgRoyaleMatchups({ card }: { card: RoyaleCard }) {
  const matchup = royaleMatchups(card.id);
  return <section className={styles.matchups} aria-label="キャラクター相性表">
    <h3>{card.name}の相性</h3>
    <p className={styles.matchupNote}>各1枚・同じ強さ・タワー支援なしで戦う目安です。配置、コスト、味方の援護や敵の強化で変わります。</p>
    <div className={styles.matchupLists}>
      <div data-relation="strong"><h4>○ 有利な相手</h4>{matchup.strong.length ? <ul>{matchup.strong.map(entry => <li key={entry.card.id}><strong>{entry.card.name}</strong><span>{entry.reason}</span></li>)}</ul> : <p>明確に有利な相手はありません。味方やタワーと組み合わせよう。</p>}</div>
      <div data-relation="weak"><h4>△ 苦手な相手</h4>{matchup.weak.length ? <ul>{matchup.weak.map(entry => <li key={entry.card.id}><strong>{entry.card.name}</strong><span>{entry.reason}</span></li>)}</ul> : <p>明確に不利な相手はありません。数や配置には注意。</p>}</div>
    </div>
    <details className={styles.fullMatrix}><summary>全17キャラの相性表を見る <span>○ 有利 / △ 不利 / ・互角</span></summary>
      <div className={styles.matrixScroll} tabIndex={0} role="region" aria-label="全キャラ相性表。横にスクロールできます。">
        <table><caption>行の自軍キャラから、列の敵キャラへの相性</caption><thead><tr><th scope="col">自軍 ↓ / 敵 →</th>{ROYALE_CARDS.map(enemy => <th scope="col" key={enemy.id} title={enemy.name}>{enemy.shortName}</th>)}</tr></thead>
          <tbody>{ROYALE_CARDS.map(ally => <tr key={ally.id} data-selected={ally.id === card.id}><th scope="row">{ally.name}</th>{ROYALE_CARDS.map(enemy => {
            const pair = royaleMatchup(ally.id, enemy.id);
            return <td key={enemy.id} data-relation={pair.relation} title={`${ally.name} → ${enemy.name}：${labels[pair.relation]}。${pair.reason}`} aria-label={`${enemy.name}に${labels[pair.relation]}`}>{symbols[pair.relation]}</td>;
          })}</tr>)}</tbody></table>
      </div>
    </details>
  </section>;
});
