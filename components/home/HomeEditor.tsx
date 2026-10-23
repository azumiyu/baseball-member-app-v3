"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Check, ChevronDown, ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import type { AuthMember } from "@/lib/auth-types";
import { createEntityId } from "@/lib/entity-id";
import { HOME_CONTENT_LIMITS, validateHomeContent, type HomeColumn, type HomeContent } from "@/lib/home-content";
import { api, type ApiError } from "@/components/team/lib/api";
import { HOME_IMAGE_MAX_BYTES } from "@/lib/home-images";
import { japanDate } from "@/lib/schedule";

type Snapshot = { data: HomeContent; revision: number; member: AuthMember };
type Section = "notices" | "columns";
type Confirmation = { type: "delete"; kind: Section; id: string; title: string } | { type: "reload" } | { type: "leave" };

function canPreviewImage(url: string): boolean {
  try {
    const parsed = new URL(url, "https://local.invalid");
    return parsed.protocol === "https:" && (url.startsWith("https://") || /^\/(?:homepage\/|api\/home-content\/images\/)/.test(url));
  } catch { return false; }
}

async function prepareColumnImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
    throw new Error("20MB以下の画像を選択してください。");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("この画像を読み込めませんでした。JPEG・PNG・WebPの画像を選び直してください。"));
      image.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を変換できませんでした。ブラウザーを更新してお試しください。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.56]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && ["image/webp", "image/jpeg", "image/png"].includes(blob.type) && blob.size <= HOME_IMAGE_MAX_BYTES) return blob;
    }
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.65));
    if (jpeg && jpeg.size <= HOME_IMAGE_MAX_BYTES) return jpeg;
    throw new Error("画像が大きすぎます。小さい画像を選ぶか、トリミングしてお試しください。");
  } finally { URL.revokeObjectURL(url); }
}

export function HomeEditor() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<HomeContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [accessError, setAccessError] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("notices");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const alive = useRef(false);
  const writing = useRef(false);
  const loadRequest = useRef(0);
  const leaveApproved = useRef(false);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const dialogFocusTarget = useRef<string | null>(null);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(snapshot?.data);
  const canEdit = snapshot?.member.canEditLineup === true && !accessError;
  const disabled = busy || loading || conflict || uploadingId !== null;

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    try {
      const next = await api<Snapshot>("/api/home-content");
      if (!alive.current || request !== loadRequest.current) return;
      setSnapshot(next); setDraft(next.data); setAccessError(0); setConflict(false);
      setError(""); setMessage(""); setEditingColumn(null);
    } catch (cause) {
      if (!alive.current || request !== loadRequest.current) return;
      const status = (cause as ApiError).status;
      setAccessError(status === 401 || status === 403 ? status : 0);
      setError(cause instanceof Error ? cause.message : "編集内容を読み込めませんでした。");
    } finally { if (alive.current && request === loadRequest.current) setLoading(false); }
  }, []);

  useEffect(() => {
    alive.current = true;
    const resetLeave = () => { leaveApproved.current = false; };
    window.addEventListener("pageshow", resetLeave);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the editable snapshot on entry.
    void load();
    return () => { alive.current = false; loadRequest.current += 1; window.removeEventListener("pageshow", resetLeave); };
  }, [load]);

  useEffect(() => {
    if (!dirty && !uploadingId) return;
    const prevent = (event: BeforeUnloadEvent) => {
      if (leaveApproved.current) { leaveApproved.current = false; return; }
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, uploadingId]);

  useEffect(() => {
    if (!focusTarget) return;
    const frame = requestAnimationFrame(() => document.getElementById(focusTarget.id)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusTarget]);

  function update(data: HomeContent) {
    setDraft(data); setMessage("");
    if (!accessError && !conflict) setError("");
  }
  function ask(next: Confirmation, trigger: HTMLElement) {
    dialogTrigger.current = trigger;
    dialogFocusTarget.current = null;
    setConfirmation(next);
    setConfirmOpen(true);
  }
  function focusInput(id: string) {
    if (confirmOpen) dialogFocusTarget.current = id;
    setFocusTarget({ id });
  }
  function reload(event: React.MouseEvent<HTMLButtonElement>) {
    if (loading || writing.current) return;
    if (dirty) ask({ type: "reload" }, event.currentTarget);
    else void load();
  }
  function leave() {
    leaveApproved.current = true;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reload published content after the explicit save/discard decision.
    window.location.assign("/home");
  }
  function goHome(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (writing.current) {
      event.preventDefault();
      return;
    }
    if (dirty) { event.preventDefault(); ask({ type: "leave" }, event.currentTarget); }
  }
  function confirmAction() {
    if (!confirmation || !confirmOpen || writing.current || loading) return;
    setConfirmOpen(false);
    if (confirmation.type === "leave") leave();
    else if (confirmation.type === "reload") void load();
    else if (draft && canEdit && !disabled) {
      const { kind, id } = confirmation;
      update({ ...draft, [kind]: draft[kind].filter((item) => item.id !== id) });
      if (kind === "columns" && editingColumn === id) setEditingColumn(null);
    }
  }
  function switchTab(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "notices" : event.key === "End" ? "columns" : activeSection === "notices" ? "columns" : "notices";
    setActiveSection(next);
    document.getElementById(`home-tab-${next}`)?.focus();
  }
  function addNotice() {
    if (!draft || draft.notices.length >= HOME_CONTENT_LIMITS.notices) return;
    const id = createEntityId();
    update({ ...draft, notices: [{ id, date: japanDate(), text: "", published: false }, ...draft.notices] });
    setFocusTarget({ id: `home-notice-${id}` });
  }
  function move(kind: "notices" | "columns", index: number, direction: number) {
    if (!draft) return;
    const items = [...draft[kind]];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    update({ ...draft, [kind]: items });
  }
  function editColumn(id: string, changes: Partial<HomeColumn>) {
    if (draft) update({ ...draft, columns: draft.columns.map((column) => column.id === id ? { ...column, ...changes } : column) });
  }
  function addColumn() {
    if (!draft || draft.columns.length >= HOME_CONTENT_LIMITS.columns) return;
    const id = createEntityId();
    update({ ...draft, columns: [{ id, date: japanDate(), title: "", body: "", imageUrl: "", imageAlt: "", linkUrl: "", linkLabel: "", published: false }, ...draft.columns] });
    setEditingColumn(id);
    setFocusTarget({ id: `home-column-title-${id}` });
  }
  async function uploadImage(columnId: string, file: File) {
    if (!canEdit || disabled || writing.current) return;
    writing.current = true; setUploadingId(columnId); setError(""); setMessage("");
    try {
      const blob = await prepareColumnImage(file);
      if (!alive.current) return;
      const response = await fetch("/api/home-content/images", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": blob.type }, body: blob,
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw Object.assign(new Error(result.error || "画像をアップロードできませんでした。"), { status: response.status });
      if (!alive.current) return;
      setDraft((current) => current ? { ...current, columns: current.columns.map((column) => column.id === columnId ? { ...column, imageUrl: result.url!, imageAlt: column.imageAlt || column.title } : column) } : current);
      setMessage("画像を取り込みました。保存して反映してください。");
    } catch (cause) {
      if (!alive.current) return;
      const status = (cause as ApiError).status;
      setAccessError(status === 401 || status === 403 ? status : 0);
      setError(cause instanceof Error ? cause.message : "画像をアップロードできませんでした。");
      setFocusTarget({ id: "home-editor-error" });
    } finally { writing.current = false; if (alive.current) setUploadingId(null); }
  }
  async function save(leaveAfter = false) {
    if (!snapshot || !draft || !canEdit || disabled || writing.current || !dirty) return;
    const emptyNotice = draft.notices.findIndex((notice) => !notice.text.trim());
    if (emptyNotice !== -1) {
      setActiveSection("notices");
      focusInput(`home-notice-${draft.notices[emptyNotice].id}`);
      setError(`お知らせ${emptyNotice + 1}の本文を入力してください。`); return;
    }
    const emptyColumn = draft.columns.find((column) => !column.title.trim() || !column.body.trim());
    if (emptyColumn) {
      setEditingColumn(emptyColumn.id);
      setActiveSection("columns");
      focusInput(`home-column-${emptyColumn.title.trim() ? "body" : "title"}-${emptyColumn.id}`);
      setError(`コラム「${emptyColumn.title || "新しいコラム"}」のタイトルと本文を入力してください。`);
      return;
    }
    let data: HomeContent;
    try { data = validateHomeContent(draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "入力内容を確認してください。"); focusInput("home-editor-error"); return; }
    writing.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<Snapshot>("/api/home-content", "PUT", { data, revision: snapshot.revision });
      if (!alive.current) return;
      setSnapshot(result); setDraft(result.data); setMessage("保存しました");
      if (leaveAfter) leave();
    } catch (cause) {
      if (!alive.current) return;
      const status = (cause as ApiError).status;
      setConflict(status === 409);
      setAccessError(status === 401 || status === 403 ? status : 0);
      setError(cause instanceof Error ? cause.message : "保存できませんでした。入力内容は残っています。");
      focusInput("home-editor-error");
    } finally { writing.current = false; if (alive.current) setBusy(false); }
  }

  return <main className="home-page home-editor-page">
    <header className="home-header home-editor-header right-scroll-bar-position">
      <a className="home-editor-back" href="/home" onClick={goHome} aria-disabled={busy || uploadingId !== null}><ArrowLeft size={18} aria-hidden="true" />ホームページ</a>
      <span>YG FIRES <small>／ 編集ページ</small></span>
    </header>
    <div className="home-editor-content">
      <div className="home-editor-heading"><div><p className="home-eyebrow">HOME EDITOR</p><h1>お知らせ・コラム編集</h1></div><Link href="/home" target="_blank" rel="noreferrer">公開ページを見る<ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></Link></div>
      <p className="home-editor-help">編集後は画面下の「変更を保存」で反映。公開をオフにすると下書きとして保存できます。</p>
      {error && <div id="home-editor-error" className="home-editor-error" role="alert" tabIndex={-1}><p>{error}</p>{accessError === 401 ? <Link href="/">ログイン画面へ</Link> : accessError === 403 ? <p>編集権限のあるアカウントでログインしてください。</p> : (conflict || !draft) && <button type="button" disabled={busy || loading || uploadingId !== null} onClick={reload}>{conflict ? "最新の内容を読み込む" : "再読み込み"}</button>}</div>}
      {loading && <p role="status">編集内容を読み込んでいます…</p>}
      {draft && canEdit && <form noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset className="home-editor-fields" disabled={disabled}>
          <div className="home-editor-tabs" role="tablist" aria-label="編集する内容">
            {(["notices", "columns"] as const).map((section) => <button key={section} id={`home-tab-${section}`} type="button" role="tab" aria-selected={activeSection === section} aria-controls={`home-panel-${section}`} tabIndex={activeSection === section ? 0 : -1} onClick={() => setActiveSection(section)} onKeyDown={switchTab}>{section === "notices" ? "お知らせ" : "コラム"}<span>{draft[section].length}</span></button>)}
          </div>
          <section id="home-panel-notices" className="home-editor-section" role="tabpanel" aria-labelledby="home-tab-notices" hidden={activeSection !== "notices"}>
            <div className="home-editor-section-heading"><h2>お知らせ <small>{draft.notices.length}件</small></h2><button className="home-editor-button" type="button" disabled={draft.notices.length >= HOME_CONTENT_LIMITS.notices} onClick={addNotice}><Plus size={17} aria-hidden="true" />お知らせを追加</button></div>
            {draft.notices.length === 0 && <p className="home-editor-help">お知らせを追加してください。</p>}
            <div className="home-editor-list">
              {draft.notices.map((notice, index) => <div className="home-editor-notice" key={notice.id}>
                <div className="home-editor-card-meta">
                  <label className="home-editor-label home-editor-date">日付（任意）<input type="date" min="1000-01-01" max="9999-12-31" value={notice.date || ""} onChange={(event) => update({ ...draft, notices: draft.notices.map((item) => item.id === notice.id ? { ...item, date: event.target.value } : item) })} /></label>
                  <label className="home-editor-published"><input type="checkbox" checked={notice.published} onChange={(event) => update({ ...draft, notices: draft.notices.map((item) => item.id === notice.id ? { ...item, published: event.target.checked } : item) })} />公開</label>
                </div>
                <label className="home-editor-label">お知らせ {index + 1}<textarea id={`home-notice-${notice.id}`} rows={3} maxLength={HOME_CONTENT_LIMITS.noticeText} placeholder="チームからのお知らせ" value={notice.text} onChange={(event) => update({ ...draft, notices: draft.notices.map((item) => item.id === notice.id ? { ...item, text: event.target.value } : item) })} /><small>{notice.text.length} / {HOME_CONTENT_LIMITS.noticeText}文字</small></label>
                <div className="home-editor-item-actions">
                  <span className="home-editor-help">{notice.published ? "公開" : "下書き"}</span>
                  <div className="home-editor-order">
                    <button type="button" disabled={index === 0} aria-label={`お知らせ${index + 1}を上へ`} onClick={() => move("notices", index, -1)}><ArrowUp size={17} aria-hidden="true" /></button>
                    <button type="button" disabled={index === draft.notices.length - 1} aria-label={`お知らせ${index + 1}を下へ`} onClick={() => move("notices", index, 1)}><ArrowDown size={17} aria-hidden="true" /></button>
                    <button type="button" className="home-editor-delete" aria-label={`お知らせ${index + 1}を削除`} onClick={(event) => ask({ type: "delete", kind: "notices", id: notice.id, title: notice.text || `お知らせ ${index + 1}` }, event.currentTarget)}><Trash2 size={17} aria-hidden="true" /></button>
                  </div>
                </div>
              </div>)}
            </div>
          </section>
          <section id="home-panel-columns" className="home-editor-section" role="tabpanel" aria-labelledby="home-tab-columns" hidden={activeSection !== "columns"}>
            <div className="home-editor-section-heading"><h2>コラム <small>{draft.columns.length}件</small></h2><button className="home-editor-button" type="button" disabled={draft.columns.length >= HOME_CONTENT_LIMITS.columns} onClick={addColumn}><Plus size={17} aria-hidden="true" />コラムを追加</button></div>
            <p className="home-editor-help">タイトルを押すと編集できます。上から順にホームページに表示されます。</p>
            {draft.columns.length === 0 && <p className="home-editor-help">最初のコラムを追加してください。</p>}
            <div className="home-editor-list">
              {draft.columns.map((column, index) => <article className="home-editor-column" key={column.id}>
                <div className="home-editor-column-heading"><button className="home-editor-column-toggle" type="button" aria-expanded={editingColumn === column.id} aria-controls={`column-fields-${column.id}`} onClick={() => setEditingColumn(editingColumn === column.id ? null : column.id)}><span>{String(index + 1).padStart(2, "0")}</span>{canPreviewImage(column.imageUrl) && <span className="home-editor-thumb"><Image src={column.imageUrl} alt="" fill unoptimized sizes="48px" /></span>}<span className="home-editor-column-summary"><strong>{column.title || "新しいコラム"}</strong><small>{column.date || "日付なし"} · {column.published ? "公開" : "下書き"}</small></span><ChevronDown size={18} aria-hidden="true" /></button></div>
                <div className="home-editor-item-actions">
                  <label className="home-editor-published"><input type="checkbox" checked={column.published} onChange={(event) => editColumn(column.id, { published: event.target.checked })} />公開</label>
                  <div className="home-editor-order">
                    <button type="button" disabled={index === 0} aria-label={`${column.title || "コラム"}を上へ`} onClick={() => move("columns", index, -1)}><ArrowUp size={17} aria-hidden="true" /></button>
                    <button type="button" disabled={index === draft.columns.length - 1} aria-label={`${column.title || "コラム"}を下へ`} onClick={() => move("columns", index, 1)}><ArrowDown size={17} aria-hidden="true" /></button>
                    <button type="button" className="home-editor-delete" aria-label={`${column.title || "コラム"}を削除`} onClick={(event) => ask({ type: "delete", kind: "columns", id: column.id, title: column.title || "新しいコラム" }, event.currentTarget)}><Trash2 size={17} aria-hidden="true" /></button>
                  </div>
                </div>
                <div id={`column-fields-${column.id}`} className="home-editor-column-fields" hidden={editingColumn !== column.id}>
                  <div className="home-editor-column-grid">
                  <div className="home-editor-main-fields">
                  <label className="home-editor-label home-editor-date">日付（任意）<input type="date" min="1000-01-01" max="9999-12-31" value={column.date || ""} onChange={(event) => editColumn(column.id, { date: event.target.value })} /></label>
                  <label className="home-editor-label">タイトル（必須）<input id={`home-column-title-${column.id}`} maxLength={HOME_CONTENT_LIMITS.title} value={column.title} onChange={(event) => editColumn(column.id, { title: event.target.value })} /></label>
                  <label className="home-editor-label">本文（必須）<textarea id={`home-column-body-${column.id}`} rows={10} maxLength={HOME_CONTENT_LIMITS.body} value={column.body} onChange={(event) => editColumn(column.id, { body: event.target.value })} /><small>{column.body.length} / {HOME_CONTENT_LIMITS.body}文字・改行も反映されます</small></label>
                  </div>
                  <div className="home-editor-media-fields">
                  <div className="home-editor-image-field">
                    <span className="home-editor-label">コラムの画像</span>
                    {canPreviewImage(column.imageUrl) && <div className="home-editor-image-preview"><Image src={column.imageUrl} alt={column.imageAlt || "選択中のコラム画像"} fill unoptimized sizes="(max-width: 820px) 85vw, 340px" /></div>}
                    <label className="home-editor-upload"><ImagePlus size={20} aria-hidden="true" /><span>{uploadingId === column.id ? "アップロード中…" : column.imageUrl ? "画像を変更する" : "画像をアップロード"}</span><input aria-label={`${column.title || "コラム"}の画像をアップロード`} type="file" accept="image/*" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void uploadImage(column.id, file); }} /></label>
                    <small>スマホの写真・PCの画像を選択できます。画像は表示に合わせて自動で軽量化します。</small>
                    {column.imageUrl && <button className="home-editor-image-remove" type="button" onClick={() => editColumn(column.id, { imageUrl: "", imageAlt: "" })}><Trash2 size={15} aria-hidden="true" />画像を外す</button>}
                    <details className="home-editor-image-url"><summary>画像URL・既存画像を使う</summary><label className="home-editor-label">画像URL<input type="text" inputMode="url" list="home-image-options" maxLength={HOME_CONTENT_LIMITS.url} value={column.imageUrl} placeholder="https://… または /homepage/bosyu.JPG" onChange={(event) => editColumn(column.id, { imageUrl: event.target.value })} /></label></details>
                  </div>
                  <details className="home-editor-options"><summary>画像の説明・リンク（任意）</summary>
                  <label className="home-editor-label">画像の説明<input maxLength={HOME_CONTENT_LIMITS.imageAlt} value={column.imageAlt} placeholder="例：試合後の集合写真" onChange={(event) => editColumn(column.id, { imageAlt: event.target.value })} /></label>
                  <div className="home-editor-link-fields">
                    <label className="home-editor-label">リンク先<input type="text" inputMode="url" maxLength={HOME_CONTENT_LIMITS.url} value={column.linkUrl} placeholder="https://…" onChange={(event) => editColumn(column.id, { linkUrl: event.target.value })} /></label>
                    <label className="home-editor-label">リンクの表示名<input maxLength={HOME_CONTENT_LIMITS.linkLabel} value={column.linkLabel} placeholder="例：Instagramで見る" onChange={(event) => editColumn(column.id, { linkLabel: event.target.value })} /></label>
                  </div>
                  </details>
                  </div>
                  </div>
                </div>
              </article>)}
            </div>
            <datalist id="home-image-options"><option value="/homepage/bosyu.JPG">選手募集の画像</option><option value="/homepage/YGrogo.PNG">YGロゴ</option></datalist>
          </section>
        </fieldset>
        <div className="home-editor-savebar right-scroll-bar-position">
          <div className="home-editor-savebar-inner">
          <p role="status">{uploadingId ? "画像をアップロード中…" : busy ? "保存中…" : error ? "上部のメッセージをご確認ください" : message ? <>{!dirty && <Check size={17} aria-hidden="true" />}{message}</> : dirty ? "未保存の変更があります" : "すべて保存済み"}</p>
          <button className="home-editor-save" type="submit" disabled={disabled || !dirty}><Save size={18} aria-hidden="true" />{busy ? "保存中…" : "変更を保存"}</button>
          </div>
        </div>
      </form>}
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent className="home-editor-confirm" onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (dialogFocusTarget.current) {
          document.getElementById(dialogFocusTarget.current)?.focus();
          dialogFocusTarget.current = null;
          return;
        }
        const trigger = dialogTrigger.current;
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        else document.getElementById(`home-tab-${activeSection}`)?.focus({ preventScroll: true });
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation?.type === "delete" ? "削除しますか？" : confirmation?.type === "reload" ? "最新の内容を読み込みますか？" : "変更を保存していません"}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.type === "delete" ? `「${confirmation.title.length > 70 ? `${confirmation.title.slice(0, 70)}…` : confirmation.title}」を削除します。「変更を保存」するまで公開ページには反映されません。` : confirmation?.type === "reload" ? "編集中の変更を破棄して、保存されている最新の内容に戻します。" : "ホームページに戻る前に、編集中の内容を保存できます。"}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="home-editor-confirm-actions">
          <AlertDialogCancel className="home-editor-confirm-cancel">{confirmation?.type === "leave" ? "編集を続ける" : "キャンセル"}</AlertDialogCancel>
          <AlertDialogAction className="home-editor-confirm-danger" disabled={busy || loading || uploadingId !== null} onClick={confirmAction}>{confirmation?.type === "delete" ? "削除する" : confirmation?.type === "reload" ? "変更を破棄して読み込む" : "保存せずに戻る"}</AlertDialogAction>
          {confirmation?.type === "leave" && canEdit && !conflict && <AlertDialogAction className="home-editor-confirm-save" disabled={disabled} onClick={() => { setConfirmOpen(false); void save(true); }}>保存して戻る</AlertDialogAction>}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
