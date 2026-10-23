"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { AuthMember, AuthResponse, LoginMember } from "@/lib/auth-types";
import { Modal } from "../common/Modal";
import { MemberSelectionForm } from "../common/MemberSelectionForm";
import { api, type ApiError } from "../lib/api";

/**
 * 保存中にセッションが切れた（401）ときに出る再ログインモーダル。
 * 編集中の内容は画面に残したまま、ログインし直して保存を再開します。
 */
type ReauthModalProps = {
  open: boolean;
  onClose: () => void;
  /** ログイン成功時。同じメンバーであることを確認してから保存を再開する。 */
  onSuccess: (member: AuthMember) => void | Promise<void>;
};

export function ReauthModal(props: ReauthModalProps) {
  // 閉じるとフォームを破棄し、次に開いたときは初期状態から始める。
  return props.open ? <ReauthForm {...props} /> : null;
}

function ReauthForm({
  open,
  onClose,
  onSuccess,
}: ReauthModalProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<LoginMember[] | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState("");

  async function acceptAuth(result: AuthResponse) {
    if (result.needsMemberSelection) {
      setMembers(result.members ?? []);
      setSelectedMemberId("");
      return;
    }
    if (!result.authenticated || !result.member) {
      setMembers(null);
      setSelectedMemberId("");
      throw new Error("ログイン状態を確認できませんでした。もう一度ログインしてください。");
    }
    await onSuccess(result.member);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<AuthResponse>("/api/auth", "POST", { password });
      setPassword("");
      await acceptAuth(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function chooseMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMemberId || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<AuthResponse>("/api/auth", "PATCH", {
        playerId: selectedMemberId,
      });
      await acceptAuth(result);
    } catch (err) {
      setError((err as Error).message);
      if ((err as ApiError).status === 401) {
        setMembers(null);
        setSelectedMemberId("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="再ログイン"
      description="編集内容を残したままログインし直します。"
    >
      {members !== null ? (
        <MemberSelectionForm
          members={members}
          selectedMemberId={selectedMemberId}
          onMemberChange={setSelectedMemberId}
          onSubmit={chooseMember}
          busy={busy}
          error={error}
        />
      ) : (
        <form onSubmit={submit}>
          <label>
            チーム共通パスワード
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="primary full" disabled={busy}>
            {busy ? "確認中…" : "ログインして保存を再開"}
          </button>
        </form>
      )}
    </Modal>
  );
}
