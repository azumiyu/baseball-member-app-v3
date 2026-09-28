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
 * スマホではキーボードを開く前の高さを維持し、本文だけをスクロールします。
 * 入力フォーカスに合わせたスクロールや、キーボードの動きへの位置追従は行いません。
 * キーボード用の末尾余白は表示中に縮めず、確定時にスクロール位置が跳ねるのを防ぎます。
 * 端末の回転・PCのウィンドウサイズ変更時は表示領域を取り直します。
 * 開いたときのフォーカスは入力欄ではなくタイトルへ移します（勝手にキーボードが出ないように）。
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  onEscapeKeyDown,
  preserveSize = true,
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
    const mobile = window.matchMedia("(max-width: 760px), (pointer: coarse)");
    let width = window.innerWidth;
    let height = Math.max(window.innerHeight, view?.height ?? 0);
    let top = view?.offsetTop ?? 0;
    let bottomInset = 0;
    let updateFrame = 0;
    const update = () => {
      // ピンチズームをウィンドウサイズ変更と扱わず、ユーザーの拡大操作を保つ。
      if (view && Math.abs(view.scale - 1) > 0.05) return;
      const visibleHeight = view?.height ?? window.innerHeight;
      const currentHeight = Math.max(window.innerHeight, visibleHeight);
      if (!preserveSize || !mobile.matches || window.innerWidth !== width) {
        height = currentHeight;
        width = window.innerWidth;
        top = view?.offsetTop ?? 0;
        bottomInset = 0;
      }
      // 余白を急に減らすとブラウザーが scrollTop を戻すため、閉じる・回転まで保持する。
      bottomInset = preserveSize ? Math.max(bottomInset, height - visibleHeight) : 0;
      const next = {
        height: preserveSize ? height : visibleHeight,
        top,
        bottomInset,
      };
      setViewport((current) => current?.height === next.height && current.top === next.top && current.bottomInset === next.bottomInset ? current : next);
    };
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(updateFrame);
      updateFrame = window.requestAnimationFrame(update);
    };
    scheduleUpdate();
    view?.addEventListener("resize", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(updateFrame);
      view?.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
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
        data-preserve-size={preserveSize || undefined}
        data-short-viewport={viewport ? viewport.height <= 480 : undefined}
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
        </div>
        <div className="team-dialog-body">
          <DialogDescription
            className={description ? "modal-description" : "sr-only"}
          >
            {description || title}
          </DialogDescription>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
