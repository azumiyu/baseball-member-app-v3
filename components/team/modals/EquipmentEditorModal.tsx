"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Modal } from "../common/Modal";

import { Input } from "@/components/ui/input";
import type { Player } from "@/lib/model";
import type { EquipmentItem } from "@/lib/equipment";
import { createEntityId } from "@/lib/entity-id";

type Props = {
  target: EquipmentItem | "new" | null;
  players: Player[];

  onClose: () => void;
  onSave: (item: EquipmentItem) => void;
  onDelete: (item: EquipmentItem) => void;
};

export function EquipmentEditorModal({
  target,
  players,
  onClose,
  onSave,
  onDelete,
}: Props) {
  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target === "new" ? "道具を登録" : "道具を編集"}
      description="チーム道具の情報・担当者・LINE通知を設定します。"
    >
      {target !== null && (
        <EquipmentEditorForm
          key={target === "new" ? "new" : target.id}
          target={target}
          players={players}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </Modal>
  );
}

function EquipmentEditorForm({ target, players, onClose, onSave, onDelete }: Omit<Props, "target"> & {
  target: EquipmentItem | "new";
}) {
  const item = target === "new" ? undefined : target;
  const [name, setName] = useState(item?.name ?? "");
  const [holderId, setHolderId] = useState(item?.holderId ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [notifyLine, setNotifyLine] = useState(item?.notifyLine ?? true);

  function submit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (!name.trim()) return;

    onSave({
      id:
        item?.id ??
        createEntityId(),

      name: name.trim(),

      holderId:
        holderId || null,

      note: note.trim(),
      notifyLine,
    });

    onClose();
  }

  return (
          <form onSubmit={submit}>
            {/* 道具名 */}

            <label>
              道具名

              <Input
                required
                maxLength={50}
                value={name}
                onChange={(event) =>
                  setName(
                    event.target.value,
                  )
                }
                placeholder="例：試合球"
              />
            </label>

            {/* 担当者 */}

            <label>
              担当者

              <select
                className="equipment-holder-select"
                value={holderId}
                onChange={(event) =>
                  setHolderId(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  担当者なし
                </option>

                {players.map(
                  (player) => (
                    <option
                      key={player.id}
                      value={player.id}
                    >
                      {player.name}
                      {" "}
                      #{player.number}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              LINE通知

              <select
                className="equipment-holder-select"
                value={notifyLine ? "notify" : "silent"}
                onChange={(event) =>
                  setNotifyLine(event.target.value === "notify")
                }
              >
                <option value="notify">LINEに通知する</option>
                <option value="silent">通知しない</option>
              </select>
            </label>

            {/* 備考 */}

            <label>
              備考{" "}
              <span className="optional">
                任意
              </span>

              <Input
                maxLength={80}
                value={note}
                onChange={(event) =>
                  setNote(
                    event.target.value,
                  )
                }
                placeholder="例：公式戦の日"
              />
            </label>

            {/* ボタン */}

            <div className="modal-actions">
              {item && (
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => {
                    if (
                      window.confirm(
                        `${item.name}を削除しますか？`,
                      )
                    ) {
                      onDelete(item);
                      onClose();
                    }
                  }}
                >
                  <Trash2 size={16} />
                  削除
                </button>
              )}

              <button
                type="submit"
                className="primary"
                disabled={!name.trim()}
              >
                {item
                  ? "変更を反映"
                  : "道具を登録"}
              </button>
            </div>
          </form>
  );
}
