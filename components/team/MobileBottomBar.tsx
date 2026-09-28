"use client";
import { FileDown, Users,ImageDown } from "lucide-react";
import type { TeamTab } from "./types";

/** スマホ用の下部固定バー（タブ切替 + PDF 作成） */
export function MobileBottomBar({
  tab,
  onToggleTab,
  pdfBusy,
  pdfDisabled,
  pdfDisabledReason,
  onCreatePdf,
  imageBusy,
  onCreateImage,
}: {
  tab: TeamTab;
  onToggleTab: () => void;
  pdfBusy: boolean;
  pdfDisabled: boolean;
  pdfDisabledReason: string;
  onCreatePdf: () => void;
  imageBusy: boolean;
  onCreateImage: () => void;
}) {
  return (
    <div className="mobile-bottom">
      <button className="mobile-nav" onClick={onToggleTab}>
        <Users size={19} />
        {tab === "order" ? "登録情報" : "オーダー"}
      </button>
      <button
        className="primary"
        onClick={onCreatePdf}
        disabled={pdfBusy || pdfDisabled}
        title={pdfDisabledReason || undefined}
      >
        <FileDown size={18} />
        {pdfBusy ? "作成中…" : pdfDisabled ? "ＰＤＦ作成不可" : "メンバー表作成"}
      </button>
      <button
    type="button"
    className="primary"
    onClick={onCreateImage}
    disabled={imageBusy}
  >
    <ImageDown size={18} />
    {imageBusy ? "作成中…" : "画像"}
  </button>
    </div>
  );
}
