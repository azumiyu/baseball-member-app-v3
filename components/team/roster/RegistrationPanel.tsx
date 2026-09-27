"use client";

import { useState } from "react";
import { Package, Users } from "lucide-react";
import type { Player } from "@/lib/model";
import { useEquipmentData } from "../hooks/useEquipmentData";
import { EquipmentList } from "../equipment/EquipmentList";
import { EquipmentEditorModal } from "../modals/EquipmentEditorModal";
import { LoadingState } from "../common/LoadingState";
import { SaveStateLabel } from "../common/SaveStateLabel";
import { RosterPanel } from "./RosterPanel";

function EquipmentRegistrationContent({ players }: { players: Player[] }) {
  const equipment = useEquipmentData();
  const [editorId, setEditorId] = useState<string | "new" | null>(null);
  const editorTarget = editorId === "new"
    ? "new"
    : editorId
      ? (equipment.data.items.find((item) => item.id === editorId) ?? null)
      : null;

  if (equipment.loading) return <LoadingState label="道具データを読み込んでいます…" />;
  if (equipment.error) {
    return (
      <section className="panel">
        <p>{equipment.error}</p>
        <button type="button" className="secondary" onClick={() => void equipment.load()}>
          再読み込み
        </button>
      </section>
    );
  }

  return (
    <>
      <div className={`stats-save-status ${equipment.saveState}`} role="status">
        <SaveStateLabel state={equipment.saveState} />
      </div>
      <EquipmentList
        items={equipment.data.items}
        players={players}
        onAdd={() => setEditorId("new")}
        onEdit={(item) => setEditorId(item.id)}
      />
      <EquipmentEditorModal
        target={editorTarget}
        players={players}
        onClose={() => setEditorId(null)}
        onSave={(item) => {
          equipment.edit((current) => ({
            ...current,
            items: current.items.some((currentItem) => currentItem.id === item.id)
              ? current.items.map((currentItem) => currentItem.id === item.id ? item : currentItem)
              : [...current.items, item],
          }));
        }}
        onDelete={(item) => {
          equipment.edit((current) => ({
            ...current,
            items: current.items.filter((currentItem) => currentItem.id !== item.id),
          }));
        }}
      />
    </>
  );
}

export function RegistrationPanel({
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
  const [tab, setTab] = useState<"players" | "equipment">("players");

  return (
    <div>
      <nav className="tabs" aria-label="登録情報画面切替">
        <button
          type="button"
          className={tab === "players" ? "active" : ""}
          onClick={() => setTab("players")}
        >
          <Users size={17} />
          登録選手
          <span className="count-badge">{players.length}</span>
        </button>
        <button
          type="button"
          className={tab === "equipment" ? "active" : ""}
          onClick={() => setTab("equipment")}
        >
          <Package size={17} />
          道具一覧
        </button>
      </nav>

      {tab === "players" ? (
        <RosterPanel
          canEditRoster={canEditRoster}
          memberId={memberId}
          players={players}
          bench={bench}
          absent={absent}
          onAddPlayer={onAddPlayer}
          onEditPlayer={onEditPlayer}
        />
      ) : (
        <EquipmentRegistrationContent players={players} />
      )}
    </div>
  );
}
