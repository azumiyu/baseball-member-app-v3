import { SYMBOL_IDS, neighborSymbol, symbolImagePath, type SymbolId, type Symbols } from "./pachinko-game";
import styles from "./SymbolDisplay.module.css";

export interface SymbolDisplayProps {
  symbols: Symbols;
  moving: [boolean, boolean, boolean];
  reach: boolean;
  jackpot: boolean;
  dimmed: boolean;
}

export function SymbolDisplay({ symbols, moving, reach, jackpot, dimmed }: SymbolDisplayProps) {
  return (
    <div
      className={styles.display}
      role="img"
      aria-label={`図柄 左${symbols[0]}、中${symbols[1]}、右${symbols[2]}`}
      data-jackpot={jackpot}
      data-dimmed={dimmed}
    >
      {symbols.map((symbol, index) => (
        <div
          key={index}
          className={styles.symbol}
          data-moving={moving[index]}
          data-highlight={reach && index !== 1 && !moving[index]}
          data-slow={reach && index === 1}
        >
          <span className={styles.reelCaption} aria-hidden="true">{["LEFT", "CENTER", "RIGHT"][index]}</span>
          {moving[index] ? <div className={styles.movingStrip} aria-hidden="true">
            {[...SYMBOL_IDS, SYMBOL_IDS[0]].map((id, row) => <Tile key={row} symbol={id} />)}
          </div> : <div className={styles.stoppedStrip} aria-hidden="true">
            <Tile symbol={neighborSymbol(symbol, -1)} />
            <Tile symbol={symbol} />
            <Tile symbol={neighborSymbol(symbol, 1)} />
          </div>}
          <div className={styles.reelGlass} aria-hidden="true" />
          {reach && index !== 1 && !moving[index] && <span className={styles.lockMark} aria-hidden="true">LOCK</span>}
        </div>
      ))}
    </div>
  );
}

function Tile({ symbol }: { symbol: SymbolId }) {
  return <div className={styles.tile}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.image} src={symbolImagePath(symbol)} alt="" width={1254} height={1254} decoding="async" draggable={false} />
  </div>;
}
