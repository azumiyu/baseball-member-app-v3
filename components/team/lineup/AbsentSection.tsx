"use client";

import { GripVertical } from "lucide-react";
import type { Player } from "@/lib/model";
import type { ScheduleResponse } from "@/lib/schedule";
import { DragButton } from "../dnd/DragButton";
import { PlayerZone } from "../dnd/PlayerZone";
import { AttendanceBadge, attendanceDescription } from "./AttendanceBadge";

/** 不参加エリア。その試合に来ない選手を置いておく場所です。 */
export function AbsentSection({
  absent,
  attendance,
  readOnly,
  selectedPlayerKey,
  onPlayerTap,
  onMoveNonAttendingToAbsent,
}: {
  absent: Player[];
  attendance: Record<string, ScheduleResponse> | null;
  readOnly: boolean;
  selectedPlayerKey: string | null;
  onPlayerTap: (key: string) => void;
  onMoveNonAttendingToAbsent: () => void;
}) {
  return (
    <>
      <PlayerZone
        zone="absent"
        disabled={readOnly}
        empty={absent.length === 0}
        label={
          <div className="section-title absent-title">
            <span>不参加</span>
            <span>{absent.length}人</span>
          </div>
        }
      >
        {absent.length ? (
          <div className="bench-grid">
            {absent.slice().sort((a, b) => Number(a.number) - Number(b.number)).map((p) => {
              const key = `absent:${p.id}`;

              return (
                <DragButton
                  key={p.id}
                  item={{ kind: "player", key }}
                  className={`bench-player ${
                    selectedPlayerKey === key ? "dragging drop-over" : ""
                  }`}
                  label={`不参加 ${p.name}${attendanceDescription(
                    attendance === null ? null : attendance[p.id],
                  )}`}
                  onClick={() => onPlayerTap(key)}
                  disabled={readOnly}
                >
                  {!readOnly && <GripVertical size={15} />}

                  <span>{p.name}</span>

                  <span className="lineup-player-meta">
                    <AttendanceBadge
                      response={
                        attendance === null ? null : attendance[p.id]
                      }
                    />
                    <span className="jersey">#{p.number}</span>
                  </span>
                </DragButton>
              );
            })}
          </div>
        ) : (
          <div className="empty-absent">
            {readOnly
              ? "不参加の選手はいません"
              : "来ない選手をここに移動"}
          </div>
        )}
      </PlayerZone>
    </>
  );
}
