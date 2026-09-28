"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Check, ChevronDown, Clock3, ExternalLink, MapPin, Pencil, Plus, Users } from "lucide-react";
import type { AuthMember } from "@/lib/auth-types";
import type { Player } from "@/lib/model";
import { createEntityId } from "@/lib/entity-id";
import { defaultEndTime, scheduleShareText, scheduleTimeRange, umpireRequestText } from "@/lib/schedule-format";
import { copyText } from "../lib/clipboard";
import {
  japanDate,
  mapLinks,
  SCHEDULE_LIMITS,
  upcomingSaturday,
  type ScheduleGame,
  type ScheduleResponse,
  type ScheduleGameStatus,
} from "@/lib/schedule";
import { LoadingState } from "../common/LoadingState";
import { Modal } from "../common/Modal";
import { SaveStateLabel } from "../common/SaveStateLabel";
import { compareScheduleChoices, defaultScheduleChoice, scheduleNameOptions, type ScheduleNameOptions } from "../lib/schedule-options";
import { useScheduleData } from "../hooks/useScheduleData";
import type { SaveState } from "../types";
import { ScheduleNotices } from "./ScheduleNotices";
import { ScheduleNameField } from "./ScheduleNameField";

const ATTENDANCE = [
  { status: "attending", label: "参加", symbol: "○" },
  { status: "absent", label: "不参加", symbol: "×" },
  { status: "undecided", label: "未定", symbol: "△" },
] as const;

const RESPONSE_FILTERS = [
  { status: "all", label: "全体" },
  ...ATTENDANCE,
  { status: "unanswered", label: "未回答" },
] as const;
type ResponseFilter = typeof RESPONSE_FILTERS[number]["status"];

const GAME_STATUSES: { status: ScheduleGameStatus; label: string }[] = [
  { status: "unconfirmed", label: "未確定" },
  { status: "proposed", label: "打診中" },
  { status: "confirmed", label: "確定" },
];
const START_TIMES = Array.from({ length: 25 }, (_, index) => `${String(7 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
const END_TIMES = Array.from({ length: 34 }, (_, index) => `${String(7 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);
type ResponseInput = Pick<ScheduleResponse, "status" | "comment">;

export type ScheduleEditorRequest = {
  requestId: string;
  gameId: string | null;
  date: string;
  startTime: string;
  title: string;
  opponent: string;
  location: string;
};

const weekday = new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" });

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日（${weekday.format(new Date(`${date}T12:00:00+09:00`))}）`;
}

function useUnsavedWarning(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
}

function ResponseEditor({
  gameId, player, response, disabled, onChange,
}: {
  gameId: string;
  player: Pick<Player, "id" | "name">;
  response?: ScheduleResponse;
  disabled: boolean;
  onChange: (response: ResponseInput) => void;
}) {
  const fieldId = useId();
  const commentId = `schedule-comment-${gameId}-${player.id}-${fieldId}`;
  return (
    <div className="schedule-response-editor">
      <div className="schedule-attendance-buttons" role="group" aria-label={`${player.name}の出欠`}>
        {ATTENDANCE.map(({ status, label, symbol }) => (
          <button
            key={status}
            type="button"
            className={`schedule-attendance-button ${status}`}
            aria-pressed={response?.status === status}
            disabled={disabled}
            onClick={() => onChange({ status, comment: response?.comment ?? "" })}
          >
            <span aria-hidden="true">{symbol}</span>{label}
            {response?.status === status && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <label htmlFor={commentId}>コメント <span>任意・全員に表示</span></label>
      <textarea
        id={commentId}
        rows={2}
        maxLength={SCHEDULE_LIMITS.comment}
        placeholder="例：30分ほど遅れます"
        value={response?.comment ?? ""}
        readOnly={disabled}
        onChange={(event) => onChange({
          status: response?.status ?? "undecided",
          comment: event.target.value,
        })}
      />
      <p className="schedule-autosave-note">出欠・コメントは自動保存されます。</p>
    </div>
  );
}

function ResponseCounts({ game, players, selected, onSelect }: {
  game: ScheduleGame;
  players: Player[];
  selected?: ResponseFilter;
  onSelect: (filter: ResponseFilter) => void;
}) {
  const counts = { all: players.length, attending: 0, absent: 0, undecided: 0, unanswered: 0 };
  for (const player of players) counts[game.responses[player.id]?.status ?? "unanswered"] += 1;
  return (
    <div className="schedule-response-counts" role="group" aria-label="出欠の集計">
      {RESPONSE_FILTERS.map(({ status, label }) => (
        <button key={status} type="button" className={status} aria-haspopup={selected === undefined ? "dialog" : undefined} aria-pressed={selected === undefined ? undefined : selected === status} aria-label={`${label} ${counts[status]}人の出欠・コメント`} onClick={() => onSelect(status)}>
          <span>{label}</span><strong>{counts[status]}</strong>
        </button>
      ))}
    </div>
  );
}

function ResponsesModal({ game, players, member, filter, open, disabled, saveState, error, onFilterChange, onResponse, onRetry, onClose }: {
  game: ScheduleGame;
  players: Player[];
  member: AuthMember;
  filter: ResponseFilter;
  open: boolean;
  disabled: boolean;
  saveState: SaveState;
  error: string;
  onFilterChange: (filter: ResponseFilter) => void;
  onResponse: (playerId: string, response: ResponseInput) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const filterLabel = RESPONSE_FILTERS.find(({ status }) => status === filter)?.label;
  // 未回答からの入力や出欠変更で、編集中の行が消えないようにする。
  const visiblePlayers = players.filter((player) => filter === "all" || (game.responses[player.id]?.status ?? "unanswered") === filter || player.id === editingPlayerId);
  return (
    <Modal open={open} onClose={onClose} title="出欠・コメント" description={`${formatDate(game.date)} ${game.title || "大会名未設定"}${game.opponent ? ` ／ vs ${game.opponent}` : ""}`}>
      <ResponseCounts game={game} players={players} selected={filter} onSelect={(next) => { setEditingPlayerId(null); onFilterChange(next); }} />
      {error && <div className="schedule-form-error" role="alert"><p>{error}</p>{saveState === "error" && <button type="button" className="secondary" onClick={onRetry}>保存を再試行</button>}{saveState === "conflict" && <p>閉じて、最新の内容を再読み込みしてください。</p>}</div>}
      {saveState !== "saved" && <p className="schedule-form-save-state" role="status"><SaveStateLabel state={saveState} /></p>}
      <div className="schedule-members" aria-label={`${filterLabel}の出欠・コメント`}>
        {visiblePlayers.length ? <ul>
          {visiblePlayers.map((player) => {
            const response = game.responses[player.id];
            const status = response?.status ?? "unanswered";
            const label = ATTENDANCE.find((entry) => entry.status === status)?.label ?? "未回答";
            const canEdit = member.isAdmin || player.id === member.id;
            const editing = editingPlayerId === player.id && canEdit;
            return (
              <li key={player.id}>
                <div className="schedule-member-heading">
                  <span className="schedule-member-name"><small>#{player.number}</small>{player.name}{player.id === member.id && <small>あなた</small>}</span>
                  <span className={`schedule-status-badge ${status}`}>{label}</span>
                  {canEdit && <button type="button" className="schedule-member-edit" disabled={disabled} aria-expanded={editing} aria-label={`${player.name}の回答を${editing ? "閉じる" : "編集"}`} onClick={() => setEditingPlayerId(editing ? null : player.id)}><Pencil size={14} aria-hidden="true" /><span>{editing ? "閉じる" : "編集"}</span></button>}
                </div>
                {editing ? <>
                  <ResponseEditor gameId={game.id} player={player} response={response} disabled={disabled} onChange={(next) => onResponse(player.id, next)} />
                  {filter !== "all" && status !== filter && <p className="schedule-autosave-note">現在は「{label}」です。編集を閉じると「{filterLabel}」の一覧から移動します。</p>}
                </> : response?.comment ? <p className="schedule-member-comment">{response.comment}</p> : null}
              </li>
            );
          })}
        </ul> : <p className="schedule-members-empty">{filter === "all" ? "登録されているメンバーはいません。" : `「${filterLabel}」のメンバーはいません。`}</p>}
      </div>
      <button type="button" className="secondary schedule-members-close" onClick={onClose}>閉じる</button>
    </Modal>
  );
}

function GameCard({ game, players, member, featured, expanded, onToggle, disabled, onEdit, onResponse, onOpenResponses }: {
  game: ScheduleGame;
  players: Player[];
  member: AuthMember;
  featured: boolean;
  expanded: boolean;
  onToggle: () => void;
  disabled: boolean;
  onEdit?: () => void;
  onResponse: (playerId: string, response: ResponseInput) => void;
  onOpenResponses: (filter: ResponseFilter) => void;
}) {
  const detailsId = useId();
  const maps = mapLinks(game);
  const ownPlayer = players.find((player) => player.id === member.id);
  const ownResponse = game.responses[member.id];
  const ownStatus = ATTENDANCE.find(({ status }) => status === ownResponse?.status)?.label ?? "未入力";

  return (
    <article className={`panel schedule-game-card${featured ? " featured" : ""}`}>
      <h2 className="schedule-game-heading">
        <button type="button" id={`${detailsId}-toggle`} className="schedule-game-summary" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>
          <span className="schedule-game-heading-copy">
            {featured && <span className="schedule-featured-label">{game.date === japanDate() ? "本日の試合" : "次の土曜日"}</span>}
            <span className="schedule-game-date"><CalendarDays size={16} aria-hidden="true" /><time dateTime={game.date}>{formatDate(game.date)}</time>{game.startTime && <span>{game.startTime}</span>}</span>
            <span className="schedule-game-title"><strong>{game.title || "大会名未設定"}</strong><span className={`schedule-game-status ${game.status}`}>{GAME_STATUSES.find((entry) => entry.status === game.status)?.label}</span>{onEdit && (<span className={`schedule-game-status ${game.umpireArranged ? "umpire-arranged" : "umpire-pending"}`}>{game.umpireArranged ? "審判手配済" : "審判未手配"}</span>)}</span>
            <span className="schedule-game-summary-info">{game.opponent ? `vs ${game.opponent}` : "対戦相手未定"}{game.location && ` ／ ${game.location}`}</span>
          </span>
          <span className="schedule-game-summary-end"><span className={`schedule-status-badge ${ownResponse?.status ?? "unanswered"}`}>{ownStatus}<span className="sr-only">（あなたの出欠）</span></span><ChevronDown size={19} aria-hidden="true" /></span>
        </button>
      </h2>
      <div id={detailsId} hidden={!expanded} className="schedule-game-details" role="region" aria-labelledby={`${detailsId}-toggle`}>
        {onEdit && (
          <button type="button" className="schedule-edit-button" disabled={disabled} onClick={onEdit} aria-label={`${formatDate(game.date)} ${game.title || "試合予定"}を編集`}>
            <Pencil size={16} aria-hidden="true" /><span>試合情報を編集</span>
          </button>
        )}
      <div className="schedule-game-info">
        <p><CalendarDays size={16} aria-hidden="true" /><time dateTime={game.date}>{formatDate(game.date)}</time></p>
        <p><Clock3 size={16} aria-hidden="true" /><span>{scheduleTimeRange(game)}</span></p>
        {game.opponent && <p><Users size={16} aria-hidden="true" /><span>対戦相手：{game.opponent}</span></p>}
        <p><MapPin size={16} aria-hidden="true" /><span>{game.location || "場所は未定"}</span></p>
      </div>
      {maps && (
        <div className="schedule-map-links" aria-label="試合会場の地図">
          {maps && <>
            <a href={maps.google} target="_blank" rel="noopener noreferrer">Googleマップ<ExternalLink size={13} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a>
            <a href={maps.apple} target="_blank" rel="noopener noreferrer">Appleマップ<ExternalLink size={13} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a>
          </>}
        </div>
      )}
      {ownPlayer && (
        <section className="schedule-own-response" aria-label="自分の出欠回答">
          <h3>あなたの出欠 <span>{ownPlayer.name}</span></h3>
          <ResponseEditor gameId={game.id} player={ownPlayer} response={game.responses[member.id]} disabled={disabled} onChange={(response) => onResponse(member.id, response)} />
        </section>
      )}
      <ResponseCounts game={game} players={players} onSelect={onOpenResponses} />
      </div>
    </article>
  );
}

type GameFields = Pick<ScheduleGame, "date" | "startTime" | "endTime" | "title" | "opponent" | "location" | "status" | "umpireArranged">;

function gameFields(game: GameFields): GameFields {
  return { date: game.date, startTime: game.startTime, endTime: game.endTime, title: game.title, opponent: game.opponent, location: game.location, status: game.status, umpireArranged: game.umpireArranged };
}

const NAME_FIELDS = [
  { field: "title", label: "大会名", placeholder: "大会名を検索・追加", maxLength: SCHEDULE_LIMITS.title },
  { field: "opponent", label: "対戦相手", placeholder: "相手チーム名を検索・追加", maxLength: SCHEDULE_LIMITS.opponent },
  { field: "location", label: "場所", placeholder: "球場名・住所を検索・追加", maxLength: SCHEDULE_LIMITS.location },
] as const;

function GameEditor({ game, defaultDate, defaults, visible, saveState, saveError, nameOptions, onSave, onDelete, onClose }: {
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

export function ScheduleView({ players, member, nameOptions, appNavigation, onSaveStateChange, onSaved, onOpenSchedule, remoteRevision, editorRequest, isVisible = true }: {
  players: Player[];
  member: AuthMember;
  nameOptions: ScheduleNameOptions;
  appNavigation?: ReactNode;
  onSaveStateChange?: (state: SaveState) => void;
  onSaved?: () => void;
  onOpenSchedule: () => void;
  remoteRevision: number;
  editorRequest: ScheduleEditorRequest | null;
  isVisible?: boolean;
}) {
  const schedule = useScheduleData();
  const [editor, setEditor] = useState<ScheduleGame | "new" | null>(null);
  const [responseView, setResponseView] = useState<{ gameId: string; filter: ResponseFilter } | null>(null);
  const [defaultDate, setDefaultDate] = useState(upcomingSaturday);
  const [newGameDefaults, setNewGameDefaults] = useState<GameFields | null>(null);
  const [editorRequestError, setEditorRequestError] = useState("");
  const handledRequest = useRef("");
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const requestedRevision = useRef(-1);
  const previousSaveState = useRef<SaveState>("saved");
  const saturday = upcomingSaturday();
  const today = japanDate();
  const blocked = schedule.loading || schedule.saveState === "conflict";
  const saveFailed = schedule.saveState === "error" || schedule.saveState === "conflict";

  useEffect(() => {
    onSaveStateChange?.(schedule.saveState);
    if (previousSaveState.current !== "saved" && schedule.saveState === "saved") onSaved?.();
    previousSaveState.current = schedule.saveState;
  }, [schedule.saveState, onSaveStateChange, onSaved]);
  useUnsavedWarning(schedule.saveState !== "saved");

  const refreshSchedule = schedule.refreshIfIdle;
  useEffect(() => {
    if (schedule.loading || schedule.error || schedule.saveState !== "saved" || editor || responseView || remoteRevision <= schedule.revision || requestedRevision.current === remoteRevision) return;
    requestedRevision.current = remoteRevision;
    void refreshSchedule();
  }, [remoteRevision, schedule.revision, schedule.loading, schedule.error, schedule.saveState, editor, responseView, refreshSchedule]);

  const loadGame = schedule.loadGame;
  useEffect(() => {
    if (!editorRequest || !isVisible || !member.canEditLineup || schedule.loading || schedule.saveState !== "saved" || editor || handledRequest.current === editorRequest.requestId) return;
    handledRequest.current = editorRequest.requestId;
    void (async () => {
      if (editorRequest.gameId) {
        const game = await loadGame(editorRequest.gameId);
        if (game) { setEditorRequestError(""); setEditor(game); setExpandedGameId(game.id); }
        else setEditorRequestError("対象の予定を開けませんでした。最新の内容を読み込み、オーダーからもう一度開いてください。");
      } else {
        setNewGameDefaults({ date: editorRequest.date, startTime: editorRequest.startTime, endTime: defaultEndTime(editorRequest.startTime), title: editorRequest.title, opponent: editorRequest.opponent, location: editorRequest.location, status: "unconfirmed", umpireArranged: false });
        setDefaultDate(editorRequest.date);
        setEditor("new");
      }
    })();
  }, [editorRequest, isVisible, member.canEditLineup, schedule.loading, schedule.saveState, editor, loadGame]);

  const sortedPlayers = [...players].sort((a, b) => a.number.localeCompare(b.number, "ja", { numeric: true }) || a.name.localeCompare(b.name, "ja"));
  const sortedGames = [...schedule.data.games].sort(compareScheduleChoices);
  const responseGame = responseView ? schedule.data.games.find((game) => game.id === responseView.gameId) : undefined;
  const featuredDate = defaultScheduleChoice(sortedGames)?.date ?? saturday;
  const featuredGames = sortedGames.filter((game) => game.date === featuredDate);
  const upcomingGames = sortedGames.filter((game) => game.date >= today && game.date !== featuredDate);
  const pastGames = sortedGames.filter((game) => game.date < today).reverse();
  const options = scheduleNameOptions(schedule.data.games, nameOptions);
  const addGame = (date = saturday) => { setNewGameDefaults(null); setDefaultDate(date); setEditor("new"); };
  const reload = () => {
    if (schedule.saveState === "saving") return;
    if (schedule.saveState !== "saved" && !window.confirm("この画面の未保存の出欠・コメント・予定の変更を破棄して、最新の内容を読み込みますか？必要な入力内容は先に控えてください。")) return;
    void schedule.load();
  };
  const saveGame = async (id: string, values: GameFields): Promise<boolean> => {
    if (!member.canEditLineup || blocked || schedule.saveState === "saving") return false;
    schedule.edit((current) => {
      const index = current.games.findIndex((game) => game.id === id);
      if (index >= 0) current.games[index] = { ...current.games[index], ...values };
      else current.games.push({ id, ...values, mapUrl: "", detailsRevision: 1, previousStartTime: null, previousEndTime: null, previousLocation: null, changedBy: null, responses: {} });
      return current;
    });
    return schedule.saveNow();
  };
  const deleteGame = (id: string) => {
    if (!member.canEditLineup || blocked || schedule.saveState === "saving") return;
    if (!window.confirm("この予定を削除しますか？この試合の出欠・コメントも削除されます。")) return;
    schedule.edit((current) => ({ games: current.games.filter((game) => game.id !== id) }));
    setEditor(null);
  };
  const updateResponse = (gameId: string, playerId: string, response: ResponseInput) => {
    if (blocked || (!member.isAdmin && playerId !== member.id)) return;
    schedule.edit((current) => {
      const game = current.games.find((item) => item.id === gameId);
      if (game) game.responses[playerId] = { ...response, confirmedRevision: game.detailsRevision };
      return current;
    });
  };
  const card = (game: ScheduleGame) => <GameCard key={game.id} game={game} players={sortedPlayers} member={member} featured={game.date === featuredDate} expanded={expandedGameId === game.id} onToggle={() => setExpandedGameId((current) => current === game.id ? null : game.id)} disabled={blocked} onEdit={member.canEditLineup ? () => setEditor(game) : undefined} onResponse={(playerId, response) => updateResponse(game.id, playerId, response)} onOpenResponses={(filter) => setResponseView({ gameId: game.id, filter })} />;

  return (
    <section className="schedule-page">
      {schedule.loginGames && <ScheduleNotices games={schedule.data.games} initialGames={schedule.loginGames} memberId={member.id} suspended={editor !== null || responseGame !== undefined || schedule.loading} saveState={schedule.saveState} error={schedule.error} onResponse={(id, response) => updateResponse(id, member.id, response)} onRetry={schedule.retrySave} onOpenSchedule={(id) => { setExpandedGameId(id); onOpenSchedule(); }} />}
      <header className="page-heading schedule-page-heading">
        <div><p className="eyebrow">TEAM SCHEDULE</p><h1>スケジュール</h1><p>試合の予定を確認して、出欠を回答しましょう。</p></div>
      </header>
      {appNavigation}
      {editorRequestError && <div className="panel schedule-error" role="alert">{editorRequestError}</div>}
      {schedule.loading ? <LoadingState label="スケジュールを読み込んでいます…" /> : schedule.error && schedule.saveState === "saved" ? (
        <div className="panel schedule-error" role="alert"><p>{schedule.error}</p><button type="button" className="secondary" onClick={reload}>再読み込み</button></div>
      ) : <>
        <div className="schedule-toolbar">
          <span className="schedule-toolbar-count">これからの予定 {sortedGames.filter((game) => game.date >= today).length}件</span>
          {member.canEditLineup && <button type="button" className="primary" disabled={blocked} onClick={() => addGame()}><Plus size={17} aria-hidden="true" />予定を追加</button>}
        </div>
        {schedule.error && saveFailed && <div className="panel schedule-error" role="alert">
          <p>{schedule.error}</p>
          <p>変更した内容はこの画面に残っています。{schedule.saveState === "conflict" ? "他の更新があるため、入力内容を控えてから再読み込みしてください。" : "通信を確認して、保存を再試行してください。"}</p>
          <div className="schedule-error-actions">{schedule.saveState === "error" && <button type="button" className="primary" onClick={schedule.retrySave}>保存を再試行</button>}<button type="button" className="secondary" onClick={reload}>変更を破棄して再読み込み</button></div>
        </div>}
        <div className="schedule-game-list">
          {featuredGames.length ? featuredGames.map(card) : <div className="panel schedule-saturday-empty">
            <span className="schedule-empty-icon"><CalendarDays size={25} aria-hidden="true" /></span><p className="schedule-featured-label">次の土曜日</p><h2>{formatDate(saturday)}</h2><p>まだ予定が登録されていません。</p>
            {member.canEditLineup ? <button type="button" className="secondary" disabled={blocked} onClick={() => addGame(saturday)}><Plus size={16} aria-hidden="true" />この日の予定を追加</button> : <p className="schedule-empty-help">予定が追加されると、ここから出欠を回答できます。</p>}
          </div>}
          {upcomingGames.length > 0 && <><h2 className="schedule-section-title">これからの予定</h2>{upcomingGames.map(card)}</>}
        </div>
        <details className="schedule-past" onToggle={(event) => { if (event.currentTarget.open && !schedule.pastLoaded && !schedule.pastLoading) void schedule.loadPast(); }}>
          <summary>過去の予定</summary>
          <div className="schedule-game-list">{pastGames.map(card)}</div>
          {schedule.pastError && <p className="schedule-form-error" role="alert">{schedule.pastError}</p>}
          {schedule.pastLoaded && !pastGames.length && <p className="schedule-autosave-note">過去の予定はありません。</p>}
          {(schedule.hasMorePast || schedule.pastError) && <button type="button" className="secondary schedule-load-more" disabled={schedule.pastLoading || blocked || schedule.saveState !== "saved"} onClick={() => void schedule.loadPast()}>{schedule.pastLoading ? "読み込み中…" : schedule.pastError ? "再試行" : "過去の予定をさらに表示"}</button>}
        </details>
      </>}
      {editor !== null && <GameEditor key={editor === "new" ? "new" : editor.id} game={editor === "new" ? undefined : editor} defaultDate={defaultDate} defaults={newGameDefaults} visible={isVisible} saveState={schedule.saveState} saveError={saveFailed ? schedule.error : ""} nameOptions={options} onSave={saveGame} onDelete={deleteGame} onClose={() => setEditor(null)} />}
      {responseView && responseGame && <ResponsesModal key={responseGame.id} game={responseGame} players={sortedPlayers} member={member} filter={responseView.filter} open={isVisible && editor === null} disabled={blocked} saveState={schedule.saveState} error={saveFailed ? schedule.error : ""} onFilterChange={(filter) => setResponseView({ gameId: responseGame.id, filter })} onResponse={(playerId, response) => updateResponse(responseGame.id, playerId, response)} onRetry={schedule.retrySave} onClose={() => setResponseView(null)} />}
    </section>
  );
}
