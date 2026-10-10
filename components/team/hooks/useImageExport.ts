"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateLineupImage } from "../lib/lineup-image";

export type ImagePreview = { url: string; blob: Blob };

/** オーダー画像の生成・共有と、プレビューURLの寿命を管理する。 */
export function useImageExport(teamName: string, onError: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const creating = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const closePreview = useCallback(() => {
    generation.current += 1;
    setPreview(null);
  }, []);

  const create = useCallback(async () => {
    if (creating.current) return;
    const target = document.querySelector<HTMLDivElement>(".lineup-capture");
    if (!target) {
      onError("オーダー画面を開いてから画像を作成してください。");
      return;
    }

    const request = ++generation.current;
    creating.current = true;
    setBusy(true);
    try {
      const blob = await generateLineupImage(target);
      if (!mounted.current || request !== generation.current) return;
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch (error) {
      if (mounted.current && request === generation.current) {
        console.error(error);
        onError("画像の作成に失敗しました。");
      }
    } finally {
      creating.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [onError]);

  const share = useCallback(async () => {
    if (!preview) return;
    const file = new File([preview.blob], `${teamName}_オーダー.png`, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (error) {
        if ((error as Error).name !== "AbortError") onError("画像の共有に失敗しました。");
      }
    } else {
      onError("共有機能を利用できません。画像を長押しして保存してください。");
    }
  }, [preview, teamName, onError]);

  return { busy, preview, create, share, closePreview };
}
