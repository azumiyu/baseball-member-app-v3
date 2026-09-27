"use client";
import { FileDown } from "lucide-react";

/** 「メンバー表をつくる」見出しと PDF 作成ボタン（PC 向け表示） */
export function PageHeading({
  teamName,
  pdfBusy,
  pdfDisabled,
  pdfDisabledReason,
  onCreatePdf,
}: {
  teamName: string;
  pdfBusy: boolean;
  pdfDisabled: boolean;
  pdfDisabledReason: string;
  onCreatePdf: () => void;
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
      <button
        className="primary"
        onClick={onCreatePdf}
        disabled={pdfBusy || pdfDisabled}
        title={pdfDisabledReason || undefined}
      >
        <FileDown size={19} />
        {pdfBusy ? "PDFを作成中…" : pdfDisabled ? "11人以上はPDF不可" : "メンバー表作成"}
      </button>
    </div>
  );
}
