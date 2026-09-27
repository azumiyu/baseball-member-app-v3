"use client";
import { useState } from "react";
import { Pencil, Plus, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Player } from "@/lib/model";
import { MAX_PLAYERS } from "../lineup/BenchSection";

/**
 * 「登録情報」タブ内の選手一覧。名簿の検索・編集への導線を持ちます。
 * 検索文字列はこの画面の中だけで使うのでローカル state です。
 */
export function RosterPanel({
  canEditRoster,
  memberId,
  players,
  bench,
  absent,
  onAddPlayer,
  onEditPlayer,
}: {
  canEditRoster: boolean;
  memberId: string;
  players: Player[];
  bench: Player[];
  absent: Player[];
  onAddPlayer: () => void;
  onEditPlayer: (player: Player) => void;
}) {
  const [query, setQuery] = useState("");

  /** 一覧右側に出すステータスラベル */
  const statusOf = (player: Player) =>
    absent.some((a) => a.id === player.id)
      ? "不参加"
      : bench.some((b) => b.id === player.id)
        ? "ベンチ"
        : "スタメン";

  return (
    <section className="panel roster-panel">
      <div className="roster-heading">
        <div>
          <h2>登録選手</h2>
          <p>名前と背番号を登録して、チームで共有。</p>
        </div>
        {canEditRoster && <button
          className="primary"
          onClick={onAddPlayer}
          disabled={players.length >= MAX_PLAYERS}
        >
          <Plus size={17} />
          選手を登録
        </button>}
      </div>

      <div className="search-field">
        <Search size={18} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・背番号で検索"
          aria-label="登録選手を検索"
        />
      </div>

      {!players.length ? (
        <div className="roster-empty">
          <Users size={36} />
          <h3>まずは、チームの選手を登録</h3>
          <p>最大{MAX_PLAYERS}人。登録した選手は何度でも使えます。</p>
          {canEditRoster && <button className="secondary" onClick={onAddPlayer}>
            <Plus size={16} />
            最初の選手を登録
          </button>}
        </div>
      ) : (
        <div className="roster-list">
          {players
            .filter((p) => `${p.name} ${p.kana} ${p.number}`.includes(query))
            .map((p) => (
              <button
                className="roster-row"
                key={p.id}
                disabled={!canEditRoster && p.id !== memberId}
                onClick={() => onEditPlayer(p)}
              >
                <span className="roster-number">{p.number}</span>
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.kana || "ふりがな未登録"}</small>
                </span>
                <span className="roster-status">{statusOf(p)}</span>
                {(canEditRoster || p.id === memberId) && <Pencil size={16} />}
              </button>
            ))}
        </div>
      )}

      <p className="roster-count">
        {players.length} / {MAX_PLAYERS}人登録済み
      </p>
    </section>
  );
}
