"use client";
import { useRef, useState } from "react";
import {
  DndContext,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { ScheduleResponse } from "@/lib/schedule";
import {
  changeMode,
  lineupCapacity,
  MAX_LINEUP_PLAYERS,
  type Player,
  type TeamData,
} from "@/lib/model";
import { useLineupSensors } from "../hooks/useLineupSensors";
import {
  countActive,
  dragEndUpdater,
  tapSwapPlayerUpdater,
  tapSwapPositionUpdater,
} from "../lib/lineup-actions";
import { AbsentSection } from "./AbsentSection";
import { BenchSection } from "./BenchSection";
import { LineupRow } from "./LineupRow";
import { PitcherRow } from "./PitcherRow";
import { GotoMoveDialog, type GotoMoveDestination } from "./GotoMoveDialog";

type PendingMove = {
  source: TeamData;
  destination: GotoMoveDestination;
  updater: (data: TeamData) => TeamData;
};

function playerDestination(
  data: TeamData,
  playerId: string,
): GotoMoveDestination {
  if (data.absentIds.includes(playerId)) return "absent";
  if (
    data.slots.some((slot) => slot.playerId === playerId) ||
    (data.mode === "dh" && data.pitcher === playerId)
  )
    return "starter";
  return "bench";
}

// A drag records slot keys, so do not replay it against a different lineup
// if a remote update arrives while the confirmation is open.
function movementKey(data: TeamData) {
  return JSON.stringify([
    data.mode,
    data.slots,
    data.pitcher,
    data.benchOrder,
    data.absentIds,
    data.players.map((player) => [player.id, player.number]),
  ]);
}

/**
 * オーダー編集の本体。DndContext はここに 1 つだけ置きます。
 *
 * collisionDetection をカスタムしているのがポイントで、
 * 「打順は打順とだけ」「守備は守備とだけ」入れ替わるように、
 * ドラッグ中の kind と一致するドロップ先だけを候補に残しています。
 */
export function OrderPanel({
  data,
  attendance,
  readOnly,
  edit,
  bench,
  absent,
  onPickPlayer,
  onPickPosition,
  onEditPlayer,
  onAddPlayer,
}: {
  data: TeamData;
  attendance: Record<string, ScheduleResponse> | null;
  readOnly: boolean;
  edit: (fn: (d: TeamData) => TeamData) => void;
  bench: Player[];
  absent: Player[];
  /** target は "pitcher" または "slot:<index>" */
  onPickPlayer: (target: string) => void;
  onPickPosition: (index: number) => void;
  onEditPlayer: (player: Player) => void;
  onAddPlayer: () => void;
}) {
  const sensors = useLineupSensors();
  const activeCount = countActive(data);
  const capacity = lineupCapacity(data);
  const pitcher = data.players.find((p) => p.id === data.pitcher);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const warningOpen =
    !readOnly && pendingMove !== null && pendingMove.source === data;
  const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(
    null,
  );
  const [selectedPositionIndex, setSelectedPositionIndex] = useState<
    number | null
  >(null);
  const selectedPlayerKeyRef = useRef<string | null>(null);
  const selectedTapPlayer = selectedPlayerKey
    ? data.players.find((player) => {
        if (selectedPlayerKey === "pitcher") {
          return player.id === data.pitcher;
        }

        if (selectedPlayerKey.startsWith("slot:")) {
          const index = Number(selectedPlayerKey.slice(5));
          return player.id === data.slots[index]?.playerId;
        }

        if (selectedPlayerKey.startsWith("bench:")) {
          return player.id === selectedPlayerKey.slice(6);
        }

        if (selectedPlayerKey.startsWith("absent:")) {
          return player.id === selectedPlayerKey.slice(7);
        }

        return false;
      })
    : undefined;
  function confirmMove() {
    const move = pendingMove;
    setPendingMove(null);
    if (readOnly || !move || move.source !== data) return;
    edit((current) =>
      movementKey(current) === movementKey(move.source)
        ? move.updater(current)
        : current,
    );
  }

  function handlePlayerTap(key: string) {
    if (readOnly) return;

    const current = selectedPlayerKeyRef.current;

    // 1人目
    if (current === null) {
      selectedPlayerKeyRef.current = key;
      setSelectedPlayerKey(key);
      return;
    }

    // 同じ選手 → 解除
    if (current === key) {
      selectedPlayerKeyRef.current = null;
      setSelectedPlayerKey(null);
      return;
    }

    // 2人目 → 即交換
    const updater = tapSwapPlayerUpdater(current, key);
    const next = updater(structuredClone(data));

    const warningPlayer = data.players.find(
      (player) =>
        player.number === "11" &&
        playerDestination(data, player.id) !==
          playerDestination(next, player.id),
    );

    // Reactの再描画を待たず、先にrefを即更新
    selectedPlayerKeyRef.current = null;
    setSelectedPlayerKey(null);

    if (warningPlayer) {
      setPendingMove({
        source: data,
        destination: playerDestination(next, warningPlayer.id),
        updater,
      });
      return;
    }

    edit(updater);
  }
  
  function handlePositionTap(index: number) {
    if (readOnly) return;

    // 1個目の守備を選択
    if (selectedPositionIndex === null) {
      setSelectedPositionIndex(index);
      return;
    }

    // 同じ守備をもう一度タップ → 選択解除
    if (selectedPositionIndex === index) {
      setSelectedPositionIndex(null);
      return;
    }

    // 2個目をタップ → 守備だけ交換
    edit(tapSwapPositionUpdater(selectedPositionIndex, index));

    setSelectedPositionIndex(null);
  }

  const collisionDetection: CollisionDetection = (args) =>
    pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) =>
          container.data.current?.kind === args.active.data.current?.kind,
      ),
    });
  const captureRef = useRef<HTMLDivElement>(null);

  return (
    <section className="order-panel">
      <div className="order-toolbar">
        <h2>オーダー</h2>
        <select
          className="mode-select"
          aria-label="試合のルール"
          value={data.mode}
          disabled={readOnly}
          onChange={(e) =>
            edit((d) =>
              changeMode(d, e.target.value as "normal" | "dh" | "all"),
            )
          }
        >
          <option value="normal">9人制</option>
          <option value="dh">DH制</option>
          <option value="all">全員打ち</option>
        </select>
        {data.mode === "all" && (
          <select
            className="mode-select lineup-count-select"
            aria-label="オーダー人数"
            value={capacity}
            disabled={readOnly}
            onChange={(event) =>
              edit((current) =>
                changeMode(current, "all", Number(event.target.value)),
              )
            }
          >
            {Array.from(
              { length: MAX_LINEUP_PLAYERS - 9 },
              (_, index) => index + 10,
            ).map((count) => (
              <option key={count} value={count}>
                {count}人
              </option>
            ))}
          </select>
        )}
      </div>

      {readOnly ? (
        <p className="lineup-readonly-note">閲覧専用</p>
      ) : (
        <p className="drag-help" aria-live="polite">
          {selectedTapPlayer ? (
            <>
              <strong>{selectedTapPlayer.name}</strong>
              と入れ替える選手をタップ
            </>
          ) : (
            <>
              <GripVertical size={14} />
              選手をタップして入れ替え・ドラッグでも移動できます
            </>
          )}
        </p>
      )}
      <GotoMoveDialog
        open={warningOpen}
        destination={pendingMove?.destination ?? "starter"}
        onConfirm={confirmMove}
        onCancel={() => setPendingMove(null)}
      />

      <DndContext
        sensors={sensors}
        onDragEnd={(event) => {
          if (readOnly) return;
          const updater = dragEndUpdater(event);
          if (!updater) return;
          const next = updater(structuredClone(data));
          const warningPlayer = data.players.find(
            (player) =>
              player.number === "11" &&
              playerDestination(data, player.id) !==
                playerDestination(next, player.id),
          );
          if (warningPlayer) {
            setPendingMove({
              source: data,
              destination: playerDestination(next, warningPlayer.id),
              updater,
            });
            return;
          }
          edit(updater);
        }}
        collisionDetection={collisionDetection}
      >
        <div ref={captureRef} className="lineup-capture">
          <div className="section-title">
            <span>スターティングオーダー</span>
            <span>
              {activeCount} / {capacity}
            </span>
          </div>
          <div className="column-labels">
            <span>打順</span>
            <span>
              選手 /
              {attendance !== null && (
                <span data-capture-hide="true"> 出欠 /</span>
              )}{" "}
              背番号
            </span>
            <span>守備</span>
          </div>

          <div className="lineup-list">
            {data.slots.map((slot, i) => (
              <LineupRow
                key={i}
                readOnly={readOnly}
                index={i}
                position={slot.position}
                player={data.players.find((p) => p.id === slot.playerId)}
                attendance={
                  attendance === null || !slot.playerId
                    ? null
                    : attendance[slot.playerId]
                }
                onPickPlayer={() => onPickPlayer(`slot:${i}`)}
                onPickPosition={() => handlePositionTap(i)}
                selected={selectedPlayerKey === `slot:${i}`}
                positionSelected={selectedPositionIndex === i}
                onPlayerTap={() => handlePlayerTap(`slot:${i}`)}
              />
            ))}
            {data.mode === "dh" && (
              <PitcherRow
                readOnly={readOnly}
                pitcher={pitcher}
                attendance={
                  attendance === null || !pitcher
                    ? null
                    : attendance[pitcher.id]
                }
                onPick={() => onPickPlayer("pitcher")}
                selected={selectedPlayerKey === "pitcher"}
                onPlayerTap={() => handlePlayerTap("pitcher")}
              />
            )}
          </div>

          <BenchSection
            readOnly={readOnly}
            bench={bench}
            attendance={attendance}
            totalPlayers={data.players.length}
            selectedPlayerKey={selectedPlayerKey}
            onPlayerTap={handlePlayerTap}
            onAddPlayer={onAddPlayer}
          />
        </div>
        <AbsentSection
          readOnly={readOnly}
          absent={absent}
          attendance={attendance}
          selectedPlayerKey={selectedPlayerKey}
          onPlayerTap={handlePlayerTap}
          onMoveNonAttendingToAbsent={() => {
            if (!attendance) return;

            edit((current) => {
              const nonAttendingBenchIds = new Set(
                bench
                  .filter(
                    (player) => attendance[player.id]?.status !== "attending",
                  )
                  .map((player) => player.id),
              );

              // ベンチ順から外す
              current.benchOrder = current.benchOrder.filter(
                (id) => !nonAttendingBenchIds.has(id),
              );

              // 不参加へ追加
              current.absentIds = Array.from(
                new Set([...current.absentIds, ...nonAttendingBenchIds]),
              );

              return current;
            });
          }}
        />
      </DndContext>
    </section>
  );
}
