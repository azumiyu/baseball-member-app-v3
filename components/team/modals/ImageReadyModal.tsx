"use client";

import { ImageDown } from "lucide-react";
import { Modal } from "../common/Modal";
import type { ImagePreview } from "../hooks/useImageExport";

/** オーダー画像のプレビュー・保存モーダル */
export function ImageReadyModal({
  preview,
  onClose,
  onSave,
}: {
  preview: ImagePreview | null;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={preview !== null}
      onClose={onClose}
      title=""
    >
      {preview && (
        <>
          {/* モーダル上部の操作ボタン */}
          <div
            className="modal-actions"
            style={{
              marginTop: 0,
              marginBottom: 16,
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              className="secondary"
              onClick={onClose}
            >
              閉じる
            </button>

            <button
              type="button"
              className="primary"
              onClick={onSave}
            >
              <ImageDown size={18} />
              写真を共有・保存
            </button>
          </div>

          {/* PDFと同じプレビュー領域のCSSを流用 */}
          <div className="pdf-ready">
            <img
              src={preview.url}
              alt="オーダー画像"
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                borderRadius: 8,
                WebkitTouchCallout: "default",
                WebkitUserSelect: "auto",
                userSelect: "auto",
              }}
            />
          </div>

          <p className="modal-description">
            iPhoneでは画像を長押しして写真に保存することもできます。
          </p>
        </>
      )}
    </Modal>
  );
}
