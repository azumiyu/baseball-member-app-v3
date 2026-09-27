"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * このアプリ共通のモーダル。
 *
 * スマホでソフトキーボードが出たときにダイアログがはみ出さないよう、
 * visualViewport の高さ・位置を CSS 変数（--dialog-height / --dialog-top）に流し込みます。
 * preserveSize の場合は開いた時のサイズを維持し、キーボードの分だけ本文のスクロール余白を増やします。
 * 開いたときのフォーカスは入力欄ではなくタイトルへ移します（勝手にキーボードが出ないように）。
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  onEscapeKeyDown,
  preserveSize = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  preserveSize?: boolean;
  children: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [viewport, setViewport] = useState<{ height: number; top: number; bottomInset: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    const view = window.visualViewport;
    if (!view) return;
    const initial = { height: view.height, top: view.offsetTop };
    const update = () => setViewport(preserveSize ? {
      ...initial,
      bottomInset: Math.max(0, initial.top + initial.height - view.offsetTop - view.height),
    } : { height: view.height, top: view.offsetTop, bottomInset: 0 });
    update();
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update);
    return () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update);
    };
  }, [open, preserveSize]);

  const style = viewport
    ? ({
        "--dialog-height": `${viewport.height}px`,
        "--dialog-top": `${viewport.top}px`,
        "--dialog-bottom-inset": `${viewport.bottomInset}px`,
      } as CSSProperties)
    : undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        layout="app"
        style={style}
        onEscapeKeyDown={onEscapeKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
      >
        <div className="team-dialog-header">
          <DialogTitle ref={titleRef} tabIndex={-1} className="modal-title">
            {title}
          </DialogTitle>
          <DialogDescription
            className={description ? "modal-description" : "sr-only"}
          >
            {description || title}
          </DialogDescription>
        </div>
        <div className="team-dialog-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
