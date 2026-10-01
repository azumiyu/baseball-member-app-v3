"use client";
import { CircleDot, ClipboardList, Sparkles, Users, Gamepad2, WalletCards } from "lucide-react";
import { Modal } from "../common/Modal";

/**
 * ロゴから開くアプリランチャー。
 * 機能を増やすときはここに項目を足していきます。
 */
export function AppMenuModal({
  open,
  onClose,
  onOpenLineup,
}: {
  open: boolean;
  onClose: () => void;
  onOpenLineup: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="YG チームメニュー"
      description="使用する機能を選択してください。"
    >
      <div className="app-launcher-grid">
        <button className="app-launcher-item active" onClick={onOpenLineup}>
          <ClipboardList size={26} />
          <strong>選手用ツール</strong>
          <small>成績・登録情報等</small>
        </button>

        <a href="/home" className="app-launcher-item" onClick={onClose}>
          <Users size={26} />
          <strong>ホームページ</strong>
          <small>YG FIRES 公式ホームページ</small>
        </a>

        <a href="/accounting" className="app-launcher-item" onClick={onClose}>
          <WalletCards size={26} aria-hidden="true" />
          <strong>会計</strong>
          <small>部費・収支管理</small>
        </a>
        <a href="/goto" className="app-launcher-item" onClick={onClose}>
          <Sparkles size={26} aria-hidden="true" />
          <strong>後藤君のありがたいお話</strong>
          <small>人生に、ときどき後藤を。</small>
        </a>
        <a href="/pachi" className="app-launcher-item" onClick={onClose}>
          <CircleDot size={26} aria-hidden="true" />
          <strong>YGパチンコ</strong>
          <small>YG NIGHT STADIUM</small>
        </a>
        <a href="/game" className="app-launcher-item" onClick={onClose}>
          <Gamepad2 size={26} aria-hidden="true" />
          <strong>YGミニゲーム</strong>
          <small>チームのみんなでスコア勝負</small>
        </a>
      </div>
    </Modal>
  );
}
