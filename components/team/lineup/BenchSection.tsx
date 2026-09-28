"use client";
import { GripVertical, Plus, Users } from "lucide-react";
import type { Player } from "@/lib/model";
import type { ScheduleResponse } from "@/lib/schedule";
import { DragButton } from "../dnd/DragButton";
import { PlayerZone } from "../dnd/PlayerZone";
import { AttendanceBadge, attendanceDescription } from "./AttendanceBadge";

/** 登録できる選手の上限 */
export const MAX_PLAYERS = 30;

/** ベンチ（控え選手）エリア。ここへドロップするとスタメンから外れます。 */
export function BenchSection({
  bench,
  attendance,
  readOnly,
  totalPlayers,
  onEditPlayer,
  onAddPlayer,
}: {
  bench: Player[];
  attendance: Record<string, ScheduleResponse> | null;
  readOnly: boolean;
  totalPlayers: number;
  onEditPlayer: (player: Player) => void;
  onAddPlayer: () => void;
}) {
  return (
    <>
      <PlayerZone
        zone="bench"
        disabled={readOnly}
        empty={bench.length === 0}
        label={
          <div className="section-title bench-title">
            <span>ベンチ</span>
            <span>{bench.length}人</span>
          </div>
        }
        footer={
          !readOnly ? (
            <button
              className="add-player-link"
              onClick={onAddPlayer}
              disabled={totalPlayers >= MAX_PLAYERS}
              data-capture-hide="true"
            >
              <Plus size={16} />
              選手を登録{" "}
              <span>
                {totalPlayers}/{MAX_PLAYERS}
              </span>
            </button>
          ) : null
        }
      >
        {bench.length ? (
          <div className="bench-grid">
            {bench.map((p) => (
              <DragButton
                key={p.id}
                item={{ kind: "player", key: `bench:${p.id}` }}
                className="bench-player"
                label={`控え ${p.name}${attendanceDescription(attendance === null ? null : attendance[p.id])}`}
                onClick={() => onEditPlayer(p)}
                disabled={readOnly}
              >
                {!readOnly && <GripVertical size={15} />}
                <span>{p.name}</span>
                <span className="lineup-player-meta" data-capture-hide="true">
                  <AttendanceBadge
                    response={attendance === null ? null : attendance[p.id]}
                  />
                  <span className="jersey">#{p.number}</span>
                </span>
              </DragButton>
            ))}
          </div>
        ) : (
          <div className="empty-bench">
            <Users size={25} />
            <p>
              <span data-capture-hide="true">
                {readOnly
                  ? "ベンチの選手はいません"
                  : totalPlayers
                    ? "ここに移動するとベンチに戻せます"
                    : "選手を登録してオーダーを組みましょう"}
              </span>

              <span className="capture-only">ベンチの選手はいません</span>
            </p>
          </div>
        )}
      </PlayerZone>
    </>
  );
}
