"use client";
import { FileDown,ImageDown  } from "lucide-react";

/** 「メンバー表をつくる」見出しと PDF 作成ボタン（PC 向け表示） */
export function PageHeading({
  teamName,
  pdfBusy,
  pdfDisabled,
  pdfDisabledReason,
  onCreatePdf,
  imageBusy,
  onCreateImage,
}: {
  teamName: string;
  pdfBusy: boolean;
  pdfDisabled: boolean;
  pdfDisabledReason: string;
  onCreatePdf: () => void;
  imageBusy: boolean;
  onCreateImage: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">GAME DAY</p>
        <h1>オーダー</h1>
        <p>
          {teamName} <span className="heading-separator">/</span> 公式戦オーダー
        </p>
      </div>
      <div className="heading-actions">
      <button
        className="primary"
        onClick={onCreatePdf}
        disabled={pdfBusy || pdfDisabled}
        title={pdfDisabledReason || undefined}
      >
        <FileDown size={19} />
        {pdfBusy
          ? "PDFを作成中…"
          : pdfDisabled
            ? "11人以上はPDF不可"
            : "メンバー表作成"}
      </button>
      <button
        className="secondary"
        onClick={onCreateImage}
        disabled={imageBusy}
      >
        <ImageDown size={19} />
        {imageBusy ? "画像を作成中…" : "画像で保存"}
      </button>
      </div>
    </div>
  );
}
