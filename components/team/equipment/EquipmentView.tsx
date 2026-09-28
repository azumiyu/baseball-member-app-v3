"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from "@dnd-kit/core";
import { Bell, BellOff, Package, Pencil, UserRound, X } from "lucide-react";
import type { Player } from "@/lib/model";
import type { EquipmentItem } from "@/lib/equipment";
import type { SaveState } from "../types";
import { GotoMoveDialog } from "../lineup/GotoMoveDialog";
import { EquipmentEditorModal } from "../modals/EquipmentEditorModal";
import { LoadingState } from "../common/LoadingState";
import { useEquipmentData } from "../hooks/useEquipmentData";
import { japanDate } from "@/lib/schedule";
import { useScheduleData } from "../hooks/useScheduleData";

// The roster separates family and given names with a half/full-width space.
// Keep an unseparated name intact rather than guessing where it splits.
function surname(player: Player) {
  return player.name.trim().split(/\s+/u)[0];
}

// Releasing outside the board must not assign the nearest piece of equipment.
const equipmentCollision: CollisionDetection = (args) => {
  const point = args.pointerCoordinates ?? {
    x: args.collisionRect.left + args.collisionRect.width / 2,
    y: args.collisionRect.top + args.collisionRect.height / 2,
  };
  const droppableContainers = args.droppableContainers.filter((container) => {
    const viewport = container.node.current?.closest(".equipment-target-scroll");
    if (!viewport) return false;
    const bounds = viewport.getBoundingClientRect();
    // Off-screen cards still have DOM rectangles beneath the scroll area.
    return point.x >= bounds.left && point.x <= bounds.right &&
      point.y >= bounds.top && point.y <= bounds.bottom;
  });
  const candidates = { ...args, droppableContainers };
  return args.pointerCoordinates ? pointerWithin(candidates) : rectIntersection(candidates);
};

function EquipmentTarget({
  item, holder, selectedPlayer, disabled,  handoffRequired, onChoose,
}: {
  item: EquipmentItem;
  holder?: Player;
  selectedPlayer?: Player;
  disabled: boolean;
  handoffRequired: boolean;
  onChoose: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `equipment:${item.id}`,
    data: { type: "equipment", equipmentId: item.id },
    disabled,
  });
  const holderName = holder ? surname(holder) : item.holderId ? "不明な選手" : "担当者なし";
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`
        equipment-target
        ${isOver ? "drop-over" : ""}
        ${selectedPlayer ? "assignment-ready" : ""}
        ${handoffRequired ? "needs-handoff" : ""}
      `}      
      disabled={disabled}
      onClick={onChoose}
      title={[item.name, holder?.name ?? holderName, item.note].filter(Boolean).join(" / ")}
      aria-label={selectedPlayer
        ? `${item.name}の担当を${selectedPlayer.name}にする`
        : `${item.name}：${holder?.name ?? holderName}。担当・LINE通知設定を編集`}
    >
      <span className="equipment-target-name">
        <Package size={14} aria-hidden="true" />
        <strong>{item.name}</strong>

        {handoffRequired && (
          <span
            className="equipment-handoff-badge"
            title="引継ぎ対象"
          >
            <span className="equipment-handoff-icon" aria-hidden="true">
              ⇄
            </span>
            <span className="equipment-handoff-label">
              引継ぎ対象
            </span>
          </span>
        )}
      </span>
      {item.note && <small className="equipment-target-note">{item.note}</small>}
      <span className={`equipment-target-holder ${item.holderId ? "assigned" : ""}`}>
        <UserRound size={12} aria-hidden="true" /><span>{holderName}</span>
        {!selectedPlayer && <Pencil size={10} aria-hidden="true" />}
      </span>
    </button>
  );
}

function DraggableMember({ player, selected, disabled, onSelect }: {
  player: Player;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `member:${player.id}`,
    data: { type: "member", playerId: player.id },
    disabled,
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      className={`equipment-player-chip ${selected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${player.name}、背番号${player.number}を担当者に選ぶ`}
      title={`${player.name} #${player.number}`}
    >
      {surname(player)}
    </button>
  );
}

type Assignment = { equipmentId: string; playerId: string; previousHolderId: string | null };

export function EquipmentView({ players, appNavigation, onSaveStateChange }: {
  players: Player[];
  appNavigation?: ReactNode;
  onSaveStateChange?: (state: SaveState) => void;
}) {
  const schedule = useScheduleData();
  const equipment = useEquipmentData();
  const [notifyTab, setNotifyTab] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [pendingGotoEquipment, setPendingGotoEquipment] = useState<Assignment | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId);
  const draggedPlayer = players.find((player) => player.id === draggedPlayerId);
  const editorTarget = equipment.data.items.find((item) => item.id === editorId) ?? null;
  const blocked = equipment.loading || equipment.saveState === "conflict" || pendingGotoEquipment !== null;
  const visibleItems = equipment.data.items.filter((item) => item.notifyLine === notifyTab);
  const notifiedCount = equipment.data.items.filter((item) => item.notifyLine).length;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 10 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );
  const today = japanDate();

  // 今日を含む、これからの予定を日付・時刻順に取得
  const upcomingGames = [...schedule.data.games]
    .filter((game) => game.date >= today)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime || "99:99").localeCompare(b.startTime || "99:99") ||
        a.id.localeCompare(b.id),
    );

  // 直近の予定
  const currentGame =
    !schedule.loading && !schedule.error
      ? upcomingGames[0]
      : undefined;

  // 本日が試合日か
  const isGameDay = currentGame?.date === today;

  // 本日が試合日の場合だけ、次の試合を判定対象にする
  const nextGame = isGameDay
    ? upcomingGames.find((game) => game.date > today)
    : undefined;

  // 引継ぎが必要なメンバー
  const handoffPlayerIds = new Set(
    players
      .filter((player) => {
        if (!currentGame) return false;

        const currentStatus =
          currentGame.responses[player.id]?.status;

        // ① 直近の試合に参加できない
        if (currentStatus !== "attending") {
          return true;
        }

        // ② 本日試合日で、今日参加するが次回は参加できない
        if (isGameDay && nextGame) {
          const nextStatus =
            nextGame.responses[player.id]?.status;

          return nextStatus !== "attending";
        }

        return false;
      })
      .map((player) => player.id),
  );

  useEffect(() => {
    onSaveStateChange?.(equipment.saveState);
  }, [equipment.saveState, onSaveStateChange]);

  function assignEquipment({ equipmentId, playerId, previousHolderId }: Assignment) {
    const item = equipment.data.items.find((candidate) => candidate.id === equipmentId);
    const player = players.find((candidate) => candidate.id === playerId);
    if (!item || !player || item.holderId !== previousHolderId || equipment.saveState === "conflict") return;
    equipment.edit((current) => ({
      ...current,
      items: current.items.map((candidate) =>
        candidate.id === equipmentId && candidate.holderId === previousHolderId
          ? { ...candidate, holderId: playerId }
          : candidate,
      ),
    }));
    setSelectedPlayerId(null);
    setAnnouncement(`${item.name}の担当を${player.name}に変更しました。`);
  }

  function requestAssignment(equipmentId: string, playerId: string) {
    if (blocked) return;
    const item = equipment.data.items.find((candidate) => candidate.id === equipmentId);
    const player = players.find((candidate) => candidate.id === playerId);
    if (!item || !player) return;
    if (item.holderId === playerId) {
      setSelectedPlayerId(null);
      setAnnouncement(`${item.name}はすでに${player.name}が担当しています。`);
      return;
    }
    const assignment = { equipmentId, playerId, previousHolderId: item.holderId };
    if (player.number === "11") setPendingGotoEquipment(assignment);
    else assignEquipment(assignment);
  }

  function dragEnd(event: DragEndEvent) {
    setDraggedPlayerId(null);
    const source = event.active.data.current;
    const target = event.over?.data.current;
    if (source?.type !== "member" || target?.type !== "equipment") return;
    if (typeof source.playerId === "string" && typeof target.equipmentId === "string") {
      requestAssignment(target.equipmentId, source.playerId);
    }
  }

  function reload() {
    if (equipment.saveState !== "saved" &&
      !window.confirm("未保存の変更を破棄して最新の道具データを読み込みますか？")) return;
    setSelectedPlayerId(null);
    setAnnouncement("");
    void equipment.load();
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TEAM EQUIPMENT</p>
          <h1>チーム道具管理　          <span
            className="equipment-handoff-badge"
            title="引継ぎ対象"
          >
            <span className="equipment-handoff-icon" aria-hidden="true">
            　⇄
            </span>
            <span className="equipment-handoff-label">
              引継ぎ対象
            </span>
          </span><span className="text-min">がついているものは引き継ぎ対象です。</span></h1>

          <p>チーム道具の担当・受け渡しを管理します。</p>
        </div>
      </div>
      {appNavigation}
      {equipment.error && (
        <section className="panel equipment-error" role="alert">
          <p>{equipment.error}</p>
          <button type="button" className="secondary" onClick={reload}>再読み込み</button>
        </section>
      )}
      {equipment.loading ? <LoadingState label="道具データを読み込んでいます…" /> : (
        <section className="panel equipment-management">
          <div className="equipment-board-heading"><h2>道具担当</h2><span>{equipment.data.items.length}点</span></div>
          <div className="equipment-notify-tabs" role="group" aria-label="道具のLINE通知設定で絞り込む">
            <button type="button" aria-pressed={notifyTab} onClick={() => setNotifyTab(true)}>
              <Bell size={14} aria-hidden="true" />LINEに通知する<span>{notifiedCount}</span>
            </button>
            <button type="button" aria-pressed={!notifyTab} onClick={() => setNotifyTab(false)}>
              <BellOff size={14} aria-hidden="true" />通知しない<span>{equipment.data.items.length - notifiedCount}</span>
            </button>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={equipmentCollision}
            onDragStart={({ active }) => {
              setSelectedPlayerId(null);
              const playerId = active.data.current?.playerId;
              setDraggedPlayerId(typeof playerId === "string" ? playerId : null);
            }}
            onDragEnd={dragEnd}
            onDragCancel={() => setDraggedPlayerId(null)}
            accessibility={{ screenReaderInstructions: {
              draggable: "Enterで選手を選び、道具へ移動してEnterを押すと担当が決まります。ドラッグはスペースで開始し、矢印で移動、スペースで確定、Escapeで取り消します。",
            } }}
          >
            <div className="equipment-target-scroll" key={String(notifyTab)} tabIndex={0} role="region" aria-label={notifyTab ? "LINEに通知する道具" : "通知しない道具"}>
              {visibleItems.length ? (
                <div className="equipment-target-grid">
                  {visibleItems.map((item) => (
                    <EquipmentTarget
                      key={item.id}
                      item={item}
                      holder={players.find((player) => player.id === item.holderId)}
                      selectedPlayer={selectedPlayer}
                      disabled={blocked}
                      handoffRequired={
                        !!item.holderId && handoffPlayerIds.has(item.holderId)
                      }
                      onChoose={() => selectedPlayer
                        ? requestAssignment(item.id, selectedPlayer.id)
                        : setEditorId(item.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="equipment-board-empty">
                  <Package size={25} aria-hidden="true" />
                  <p>{equipment.data.items.length ? "この通知設定の道具はありません。" : "登録情報の「道具一覧」から道具を登録してください。"}</p>
                </div>
              )}
            </div>
            <div className="equipment-player-heading">
              <h2>担当する選手</h2>
              {selectedPlayer && <button type="button" onClick={() => setSelectedPlayerId(null)}><X size={14} />選択解除</button>}
            </div>
            <p className="equipment-assignment-help" aria-live="polite">
              {selectedPlayer ? `${surname(selectedPlayer)}の担当にする道具をタップ` : "選手を長押しして道具へ。タップでも選べます。"}
            </p>
            <div className="equipment-player-scroll" tabIndex={0} role="region" aria-label="担当者にする選手一覧">
              <div className="equipment-player-grid">
                {players.map((player) => (
                  <DraggableMember
                    key={player.id}
                    player={player}
                    selected={selectedPlayerId === player.id}
                    disabled={blocked || !equipment.data.items.length}
                    onSelect={() => setSelectedPlayerId((current) => current === player.id ? null : player.id)}
                  />
                ))}
              </div>
              {!players.length && <p className="equipment-assignment-help">登録されている選手がいません。</p>}
            </div>
            <DragOverlay dropAnimation={null}>
              {draggedPlayer && <span className="equipment-player-chip equipment-player-overlay">{surname(draggedPlayer)}</span>}
            </DragOverlay>
          </DndContext>
          <p className="equipment-assignment-status" role="status">{announcement}</p>
        </section>
      )}
      <GotoMoveDialog
        open={pendingGotoEquipment !== null}
        destination="equipment"
        onConfirm={() => {
          const pending = pendingGotoEquipment;
          setPendingGotoEquipment(null);
          if (pending) assignEquipment(pending);
        }}
        onCancel={() => setPendingGotoEquipment(null)}
      />
      <EquipmentEditorModal
        target={editorTarget}
        players={players}
        onClose={() => setEditorId(null)}
        onSave={(item) => {
          if (blocked) return;
          equipment.edit((current) => ({ ...current, items: current.items.map((candidate) => candidate.id === item.id ? item : candidate) }));
          setAnnouncement("");
        }}
        onDelete={(item) => {
          if (blocked) return;
          equipment.edit((current) => ({ ...current, items: current.items.filter((candidate) => candidate.id !== item.id) }));
          setAnnouncement("");
        }}
      />
    </>
  );
}
