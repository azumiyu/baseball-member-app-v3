"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { createEntityId } from "@/lib/entity-id";
import { SCHEDULE_LIMITS, type ScheduleGame } from "@/lib/schedule";
import { defaultEndTime, scheduleShareText, umpireRequestText } from "@/lib/schedule-format";
import { useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { copyText } from "../lib/clipboard";
import { Modal } from "../common/Modal";
import { SaveStateLabel } from "../common/SaveStateLabel";
import type { ScheduleNameOptions } from "../lib/schedule-options";
import type { SaveState } from "../types";
import { ScheduleNameField } from "./ScheduleNameField";
import { GAME_STATUSES, gameFields, type GameFields } from "./schedule-presentation";

const START_TIMES = Array.from({ length: 25 }, (_, index) => `${String(7 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
const END_TIMES = Array.from({ length: 34 }, (_, index) => `${String(7 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);

const NAME_FIELDS = [
  { field: "title", label: "大会名", placeholder: "大会名を検索・追加", maxLength: SCHEDULE_LIMITS.title },
  { field: "opponent", label: "対戦相手", placeholder: "相手チーム名を検索・追加", maxLength: SCHEDULE_LIMITS.opponent },
  { field: "location", label: "場所", placeholder: "球場名・住所を検索・追加", maxLength: SCHEDULE_LIMITS.location },
] as const;

export function ScheduleGameEditor({ game, defaultDate, defaults, visible, saveState, saveError, nameOptions, onSave, onDelete, onClose }: {
  game?: ScheduleGame;
  defaultDate: string;
  defaults: GameFields | null;
  visible: boolean;
  saveState: SaveState;
  saveError: string;
  nameOptions: ScheduleNameOptions;
  onSave: (id: string, values: GameFields) => Promise<boolean>;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [id] = useState(() => game?.id ?? createEntityId());
  const [draft, setDraft] = useState<GameFields>(() => game ? gameFields(game) : defaults ?? {
    date: defaultDate, startTime: "", endTime: "", title: "", opponent: "", location: "", status: "unconfirmed", umpireArranged: false,
  });
  const [initial] = useState(() => JSON.stringify(draft));
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copyingUmpire, setCopyingUmpire] = useState(false);
  const [shareResult, setShareResult] = useState<{ kind: "schedule" | "umpire"; text: string; copied: boolean; saved: boolean; draftJson: string } | null>(null);
  const draftJson = JSON.stringify(draft);
  const hasLocalChanges = draftJson !== (submitted ?? initial);
  const pending = saveState === "dirty" || saveState === "saving";
  const blocked = saveState === "conflict";
  useUnsavedWarning(hasLocalChanges);

  const close = () => {
    if (hasLocalChanges && !window.confirm("保存していない予定の入力を破棄して閉じますか？")) return;
    onClose();
  };
  const update = <K extends keyof GameFields>(field: K, value: GameFields[K]) => {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "startTime") next.endTime = defaultEndTime(next.startTime);
      return next;
    });
    setFormError("");
    setShareResult(null);
  };
  const validateDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || draft.date.startsWith("0000-") || !Number.isFinite(Date.parse(draft.date)) || new Date(draft.date).toISOString().slice(0, 10) !== draft.date) {
      setFormError("試合日を入力してください。");
      return false;
    }
    setFormError("");
    return true;
  };
  const copyUmpireRequest = async (form: HTMLFormElement | null) => {
    if (!form || submitting || copyingUmpire || !validateDate()) return;
    const text = umpireRequestText(draft);
    setCopyingUmpire(true);
    setShareResult(null);
    try {
      const copied = await copyText(text, form);
      setShareResult({ kind: "umpire", text, copied, saved: false, draftJson });
    } finally {
      setCopyingUmpire(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blocked || pending || submitting || copyingUmpire || !validateDate()) return;
    const values = { ...draft, title: draft.title.trim(), opponent: draft.opponent.trim(), location: draft.location.trim() };
    setFormError("");
    setDraft(values);
    setSubmitted(JSON.stringify(values));
    setSubmitting(true);
    setShareResult(null);
    const text = scheduleShareText(values);
    // iPhoneでもユーザー操作の直後にコピーを開始できるよう、保存完了を待たない。
    const copying = copyText(text, event.currentTarget);
    try {
      const [copied, saved] = await Promise.all([copying, onSave(id, values)]);
      setShareResult({ kind: "schedule", text, copied, saved, draftJson: JSON.stringify(values) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={visible}
      preserveSize
      onClose={close}
      title={game ? "予定を編集" : "予定を追加"}
      description="試合日だけで登録できます。同じ日に複数の予定も追加できます。"
      onEscapeKeyDown={(event) => {
        // Radix は capture 時に Escape を処理するため、入力側より先に閉じないようにする。
        if (event.isComposing || event.keyCode === 229 ||
            (event.target instanceof HTMLInputElement && event.target.getAttribute("aria-expanded") === "true")) event.preventDefault();
      }}
    >
      <form className="schedule-game-form" onSubmit={submit}>
        <fieldset className="schedule-editor-fields" disabled={blocked || submitting || copyingUmpire}>
        <div className="schedule-date-time-fields">
          <label htmlFor="schedule-date">試合日 <span className="schedule-required">必須</span><input id="schedule-date" type="date" required value={draft.date} onChange={(event) => update("date", event.target.value)} /></label>
          <label htmlFor="schedule-time">開始時刻 <span>任意</span><select id="schedule-time" value={draft.startTime} onChange={(event) => update("startTime", event.target.value)}><option value="">時刻未定</option>{draft.startTime && !START_TIMES.includes(draft.startTime) && <option value={draft.startTime}>{draft.startTime}（登録済み）</option>}{START_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
          <label htmlFor="schedule-end-time">終了時刻 <span>任意</span><select id="schedule-end-time" value={draft.endTime} onChange={(event) => update("endTime", event.target.value)}><option value="">時刻未定</option>{draft.endTime && !END_TIMES.includes(draft.endTime) && <option value={draft.endTime}>{draft.endTime}</option>}{END_TIMES.map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
        </div>
        <p className="schedule-autosave-note">開始時刻を選ぶと、2時間後を終了時刻に設定します。終了時刻は変更できます。</p>
        <div className="schedule-status-field"><span>予定の状況</span><div className="schedule-game-status-buttons" role="group" aria-label="予定の状況">{GAME_STATUSES.map(({ status, label }) => <button key={status} type="button" className={status} aria-pressed={draft.status === status} onClick={() => update("status", status)}>{label}{draft.status === status && <Check size={14} aria-hidden="true" />}</button>)}</div>
          <label className="schedule-umpire-check" htmlFor="schedule-umpire-arranged">
            <input id="schedule-umpire-arranged" type="checkbox" checked={draft.umpireArranged} onChange={(event) => update("umpireArranged", event.target.checked)} />
            <span><strong>審判手配状況</strong><small>{draft.umpireArranged ? "審判手配済" : "審判未手配"}</small></span>
          </label>
        </div>
        {NAME_FIELDS.map(({ field, label, placeholder, maxLength }) => (
          <ScheduleNameField
            key={field}
            label={label}
            placeholder={placeholder}
            maxLength={maxLength}
            value={draft[field]}
            options={nameOptions[field]}
            disabled={blocked}
            mapSearch={field === "location"}
            description={field === "title" ? "大会名はオーダーにも反映されます。" : undefined}
            onChange={(name) => update(field, name)}
          />
        ))}
        </fieldset>
        {formError && <p className="schedule-form-error" role="alert">{formError}</p>}
        {saveError && <div className="schedule-form-error" role="alert"><p>{saveError}</p><p>入力内容はこの画面に残っています。{blocked ? "閉じて再読み込みの案内を確認してください。" : "もう一度「予定を保存及びコピー」を押してください。"}</p></div>}
        {submitted && !hasLocalChanges && <p className={`schedule-form-save-state ${saveState}`} role="status"><SaveStateLabel state={saveState} /></p>}
        {shareResult?.draftJson === draftJson && <div className="schedule-share-fallback">
          <p className="schedule-autosave-note" role="status">{shareResult.kind === "umpire"
            ? shareResult.copied ? "審判手配用の文章をコピーしました。" : "コピーできなかったため、下の文章を選択してコピーしてください。"
            : shareResult.saved
            ? shareResult.copied ? "保存・コピーしました。LINEに貼り付けて送信できます。" : "予定は保存しました。コピーできなかったため、下の文章を選択してコピーしてください。"
            : shareResult.copied ? "文章はコピーしましたが、予定はまだ保存できていません。保存後にLINEへ送信してください。" : "保存・コピーが完了していません。もう一度お試しください。"}</p>
          {!shareResult.copied && <label>{shareResult.kind === "umpire" ? "審判手配用の文章" : "LINE用の文章"}<textarea readOnly rows={7} value={shareResult.text} onFocus={(event) => event.currentTarget.select()} /></label>}
        </div>}
        <div className="schedule-form-actions schedule-editor-actions">
          <button type="submit" className="primary" disabled={blocked || pending || submitting || copyingUmpire}>{pending || submitting ? "保存・コピー中…" : "予定を保存及びコピー"}</button>
          <button type="button" className="secondary" disabled={submitting || copyingUmpire} onClick={(event) => void copyUmpireRequest(event.currentTarget.form)}>{copyingUmpire ? "コピー中…" : "審判手配用文章をコピー"}</button>
          <button type="button" className="secondary" onClick={close}>閉じる</button>
        </div>
        {(game || (submitted && saveState === "saved")) && <button type="button" className="schedule-delete-button" disabled={blocked || pending} onClick={() => onDelete(id)}>この予定を削除</button>}
      </form>
    </Modal>
  );
}
