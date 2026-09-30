"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useRef, type ReactNode } from "react";
import type { DragKey } from "../types";

/**
 * タップとドラッグを両立するボタン。
 * 短いタップ → onClick
 * 移動/長押しドラッグ → D&D
 */
export function DragButton({
  item,
  children,
  onClick,
  className = "",
  label,
  disabled = false,
}: {
  item: DragKey;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  label: string;
  disabled?: boolean;
}) {
  const id = `${item.kind}:${item.key}`;

  const drag = useDraggable({
    id,
    data: item,
    disabled,
  });

  const drop = useDroppable({
    id,
    data: item,
    disabled,
  });

  const pointerStart = useRef<{
    x: number;
    y: number;
  } | null>(null);

  const pointerMoved = useRef(false);

  return (
    <button
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.listeners}
      {...drag.attributes}
      type="button"
      disabled={disabled}

      onPointerDownCapture={(event) => {
        pointerStart.current = {
          x: event.clientX,
          y: event.clientY,
        };

        pointerMoved.current = false;
      }}

      onPointerMoveCapture={(event) => {
        const start = pointerStart.current;
        if (!start) return;

        const distance = Math.hypot(
          event.clientX - start.x,
          event.clientY - start.y,
        );

        if (distance > 6) {
          pointerMoved.current = true;
        }
      }}

      onPointerUpCapture={() => {
        const isTap =
          !pointerMoved.current &&
          !drag.isDragging;

        pointerStart.current = null;
        pointerMoved.current = false;

        if (isTap) {
          onClick?.();
        }
      }}

      onPointerCancelCapture={() => {
        pointerStart.current = null;
        pointerMoved.current = false;
      }}

      onClick={(event) => {
        // Enter / Spaceなどキーボード操作だけここで処理。
        // マウス・タッチはpointerUp側で処理済み。
        if (event.detail === 0) {
          onClick?.();
        }
      }}

      className={`${className} drag-button ${
        drag.isDragging ? "dragging" : ""
      } ${drop.isOver ? "drop-over" : ""}`}

      aria-label={label}

      style={{
        transform: drag.transform
          ? `translate3d(${drag.transform.x}px,${drag.transform.y}px,0)`
          : undefined,
        zIndex: drag.isDragging ? 40 : undefined,
      }}
    >
      {children}
    </button>
  );
}