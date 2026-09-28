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
import { countActive, dragEndUpdater } from "../lib/lineup-actions";
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
        <p className="drag-help">
          <GripVertical size={14} />
          打順・選手・守備はドラッグで入れ替え
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
                onPickPosition={() => onPickPosition(i)}
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
              />
            )}
          </div>

          <BenchSection
            readOnly={readOnly}
            bench={bench}
            attendance={attendance}
            totalPlayers={data.players.length}
            onEditPlayer={onEditPlayer}
            onAddPlayer={onAddPlayer}
          />
        </div>
        <AbsentSection
          readOnly={readOnly}
          absent={absent}
          attendance={attendance}
          onEditPlayer={onEditPlayer}
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
