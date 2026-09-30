import type { DragEndEvent } from "@dnd-kit/core";
import { swapPlayer, type TeamData, type Player, type Position } from "@/lib/model";
import type { DragKey } from "../types";

/**
 * オーダー操作のロジックをまとめた純粋関数群。
 *
 * どの関数も「TeamData を受け取り TeamData を返す updater」で、
 * 画面側は `edit(updater)` に渡すだけです（edit 側で structuredClone 済みなので
 * ここでは引数 d を直接書き換えて構いません）。
 * UI から切り離してあるのでユニットテストも書きやすくなっています。
 */

/* ------------------------------------------------------------------ */
/* ドラッグ&ドロップ                                                    */
/* ------------------------------------------------------------------ */

/**
 * dnd-kit の DragEndEvent を updater に変換する。
 * 無効なドロップ（種別違い・同じ場所）の場合は null を返す。
 */
export function dragEndUpdater(
  event: DragEndEvent,
): ((d: TeamData) => TeamData) | null {
  const from = event.active.data.current as DragKey | undefined;
  const to = event.over?.data.current as DragKey | undefined;
  if (!from || !to || from.kind !== to.kind || from.key === to.key) return null;
  return (d) => applyDrag(d, from, to);
}

function applyDrag(d: TeamData, a: DragKey, b: DragKey): TeamData {
  if (a.kind === "player") {
    // ベンチ / 不参加ゾーンへ落とした場合（従来どおり）
    if (b.key === "bench-zone" || b.key === "absent-zone") {
      const id = resolvePlayerId(d, a.key);
      if (!id) return d;

      if (a.key === "pitcher") {
        d.pitcher = null;
      } else if (a.key.startsWith("slot:")) {
        d.slots[Number(a.key.slice(5))].playerId = null;
      }

      d.absentIds = d.absentIds.filter((v) => v !== id);

      if (b.key === "absent-zone") {
        d.absentIds.push(id);
      }

      return d;
    }

    // スタメン同士：選手と守備をセットで交換
    if (a.key.startsWith("slot:") && b.key.startsWith("slot:")) {
      const from = Number(a.key.slice(5));
      const to = Number(b.key.slice(5));

      if (!d.slots[from] || !d.slots[to]) return d;

      [d.slots[from], d.slots[to]] = [
        d.slots[to],
        d.slots[from],
      ];

      return d;
    }

    // ベンチ・不参加・DH投手との入れ替えは従来どおり
    return swapPlayer(d, a.key, b.key);
  }

  const from = Number(a.key);
  const to = Number(b.key);

  if (!d.slots[from] || !d.slots[to]) return d;

  if (a.kind === "position") {
    // 守備位置だけを交換（従来どおり）
    [d.slots[from].position, d.slots[to].position] = [
      d.slots[to].position,
      d.slots[from].position,
    ];

    return d;
  }

  // 打順の移動：選手IDだけ並べ替え、守備位置は各行に固定
  const playerIds = d.slots.map((slot) => slot.playerId);

  const [movedPlayerId] = playerIds.splice(from, 1);
  playerIds.splice(to, 0, movedPlayerId);

  d.slots.forEach((slot, index) => {
    slot.playerId = playerIds[index];
  });

  return d;
}

/** ドラッグキーから選手 ID を取り出す */
function resolvePlayerId(d: TeamData, key: string): string | null {
  if (key.startsWith("bench:")) return key.slice(6);
  if (key.startsWith("absent:")) return key.slice(7);
  if (key === "pitcher") return d.pitcher;
  return d.slots[Number(key.slice(5))]?.playerId ?? null;
}

/* ------------------------------------------------------------------ */
/* モーダルからの選択                                                   */
/* ------------------------------------------------------------------ */

/**
 * 選手選択モーダルで選んだ結果を反映する。
 * @param target "pitcher" もしくは "slot:<index>"
 * @param playerId null なら選択解除（ベンチへ戻す）
 */

export function tapSwapPositionUpdater(from: number, to: number) {
  return (d: TeamData): TeamData => {
    if (from === to) return d;
    if (!d.slots[from] || !d.slots[to]) return d;

    [d.slots[from].position, d.slots[to].position] = [
      d.slots[to].position,
      d.slots[from].position,
    ];

    return d;
  };
}

export function tapSwapPlayerUpdater(from: string, to: string) {
  return (d: TeamData): TeamData => {
    if (from === to) return d;

    // スタメン同士は
    // 選手 + 守備位置をセットで交換
    // → 打順も相手の打順へ移動する
    if (from.startsWith("slot:") && to.startsWith("slot:")) {
      const fromIndex = Number(from.slice(5));
      const toIndex = Number(to.slice(5));

      if (!d.slots[fromIndex] || !d.slots[toIndex]) {
        return d;
      }

      [d.slots[fromIndex], d.slots[toIndex]] = [
        d.slots[toIndex],
        d.slots[fromIndex],
      ];

      return d;
    }

    // ベンチ・不参加・DH投手を含む交換は
    // 既存の共通処理を利用
    return swapPlayer(d, from, to);
  };
}
export function selectPlayerUpdater(target: string, playerId: string | null) {
  return (d: TeamData): TeamData => {
    // 選択解除
    if (!playerId) {
      if (target === "pitcher") {
        d.pitcher = null;
      } else {
        d.slots[Number(target.slice(5))].playerId = null;
      }
      return d;
    }

    const slotIndex = d.slots.findIndex(
      (s) => s.playerId === playerId,
    );

    const from =
      slotIndex >= 0
        ? `slot:${slotIndex}`
        : d.pitcher === playerId
          ? "pitcher"
          : d.absentIds.includes(playerId)
            ? `absent:${playerId}`
            : `bench:${playerId}`;

    // スタメン同士の場合、選手と守備をセットで交換
    if (from.startsWith("slot:") && target.startsWith("slot:")) {
      const fromIndex = Number(from.slice(5));
      const targetIndex = Number(target.slice(5));

      if (
        fromIndex === targetIndex ||
        !d.slots[fromIndex] ||
        !d.slots[targetIndex]
      ) {
        return d;
      }

      [d.slots[fromIndex], d.slots[targetIndex]] = [
        d.slots[targetIndex],
        d.slots[fromIndex],
      ];

      return d;
    }

    // ベンチ・不参加・DH投手との交換は従来どおり
    return swapPlayer(d, from, target);
  };
}

/** 指定した打順の守備位置を、その守備位置を持つ選手と交換する */
export function setPositionUpdater(index: number, position: Position) {
  return (d: TeamData): TeamData => {
    const other = d.slots.findIndex((s) => s.position === position);
    [d.slots[index].position, d.slots[other].position] = [
      d.slots[other].position,
      d.slots[index].position,
    ];
    return d;
  };
}

/** 打順を上下に移動する（範囲外は何もしない） */
/** 打順を上下に移動（守備位置は固定） */
export function shiftOrderUpdater(index: number, delta: number) {
  return (d: TeamData): TeamData => {
    const target = index + delta;

    if (target < 0 || target >= d.slots.length) return d;

    [d.slots[index].playerId, d.slots[target].playerId] = [
      d.slots[target].playerId,
      d.slots[index].playerId,
    ];

    return d;
  };
}

/* ------------------------------------------------------------------ */
/* 名簿                                                                 */
/* ------------------------------------------------------------------ */

/** 不参加 ⇔ ベンチ をトグルする */
export function toggleAbsentUpdater(playerId: string) {
  return (d: TeamData): TeamData => {
    d.absentIds = d.absentIds.includes(playerId)
      ? d.absentIds.filter((id) => id !== playerId)
      : [...d.absentIds, playerId];
    return d;
  };
}

/** 選手を新規登録 or 上書き保存する */
export function upsertPlayerUpdater(player: Player) {
  return (d: TeamData): TeamData => ({
    ...d,
    players: d.players.some((p) => p.id === player.id)
      ? d.players.map((p) => (p.id === player.id ? player : p))
      : [...d.players, player],
  });
}

/** 選手を名簿から削除し、オーダー上の参照もすべて外す */
export function removePlayerUpdater(playerId: string) {
  return (d: TeamData): TeamData => ({
    ...d,
    players: d.players.filter((p) => p.id !== playerId),
    slots: d.slots.map((s) =>
      s.playerId === playerId ? { ...s, playerId: null } : s,
    ),
    pitcher: d.pitcher === playerId ? null : d.pitcher,
    benchOrder: d.benchOrder.filter((id) => id !== playerId),
    absentIds: d.absentIds.filter((id) => id !== playerId),
  });
}

/* ------------------------------------------------------------------ */
/* 試合情報 / マスタ                                                    */
/* ------------------------------------------------------------------ */

/** 試合情報の単一フィールドを更新する */
export function setFieldUpdater<K extends keyof TeamData>(
  key: K,
  value: TeamData[K],
) {
  return (d: TeamData): TeamData => ({ ...d, [key]: value });
}

/** 相手チーム名を選択（必要なら候補リストにも追加） */
export function pickOpponentUpdater(name: string, addToList = false) {
  return (d: TeamData): TeamData => ({
    ...d,
    opponent: name,
    opponents: addToList ? [...d.opponents, name].slice(-200) : d.opponents,
  });
}

/** 大会名を選択（必要なら候補リストにも追加） */
export function pickTournamentUpdater(name: string, addToList = false) {
  return (d: TeamData): TeamData => ({
    ...d,
    tournament: name,
    tournaments: addToList ? [...d.tournaments, name].slice(-200) : d.tournaments,
  });
}

/** スタメンに入っている人数（DH 制のときは投手も 1 人としてカウント） */
export function countActive(d: TeamData): number {
  return (
    d.slots.filter((s) => s.playerId).length +
    (d.mode === "dh" && d.pitcher ? 1 : 0)
  );
}
