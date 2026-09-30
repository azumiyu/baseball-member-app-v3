"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2, WalletCards } from "lucide-react";
import Link from "next/link";
import { accountingBalance, validateAccountingData, type AccountingData, type AccountingEntry } from "@/lib/accounting";
import type { AuthMember } from "@/lib/auth-types";
import { createEntityId } from "@/lib/entity-id";
import { japanDate } from "@/lib/schedule";
import { api, type ApiError } from "../lib/api";
import { LoadingState } from "../common/LoadingState";
import { Modal } from "../common/Modal";
import styles from "./Accounting.module.css";

type Snapshot = { data: AccountingData; revision: number; member: AuthMember };
type Draft = { id: string; date: string; category: string; income: string; expense: string };
const money = (amount: number | bigint) => `${amount.toLocaleString("ja-JP")}円`;

export function AccountingPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [year, setYear] = useState(() => Number(japanDate().slice(0, 4)));
  const [notice, setNotice] = useState("");
  const writing = useRef(false);
  const alive = useRef(false);
  const canEdit = snapshot?.member.isAdmin === true;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api<Snapshot>("/api/accounting");
      if (!alive.current) return;
      setSnapshot(next); setUnauthorized(false); setConflict(false); setError("");
    } catch (cause) {
      if (!alive.current) return;
      setUnauthorized((cause as ApiError).status === 401);
      setError(cause instanceof Error ? cause.message : "会計を読み込めませんでした。");
    } finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch the authenticated snapshot on entry.
    void load();
    return () => { alive.current = false; };
  }, [load]);

  async function save(data: AccountingData) {
    if (!snapshot || !canEdit || writing.current || conflict) return false;
    writing.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ revision: number; data?: AccountingData }>("/api/accounting", "PUT", { data, revision: snapshot.revision });
      if (!alive.current) return false;
      setSnapshot({ ...snapshot, data: result.data ?? data, revision: result.revision });
      setNotice("保存しました。");
      return true;
    } catch (cause) {
      if (!alive.current) return false;
      const status = (cause as ApiError).status;
      setConflict(status === 409);
      setUnauthorized(status === 401);
      if (status === 403) setSnapshot({ ...snapshot, member: { ...snapshot.member, isAdmin: false } });
      setError(cause instanceof Error ? cause.message : "保存できませんでした。");
      return false;
    } finally { writing.current = false; if (alive.current) setBusy(false); }
  }
  function openEntry(entry?: AccountingEntry) {
    setFormError("");
    setDraft(entry ? { ...entry, income: String(entry.income), expense: String(entry.expense) } : { id: createEntityId(), date: japanDate(), category: "", income: "0", expense: "0" });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !snapshot) return;
    if (!/^\d+$/.test(draft.income) || !/^\d+$/.test(draft.expense)) { setFormError("収入・支出は0以上の整数で入力してください。"); return; }
    const entry: AccountingEntry = { ...draft, category: draft.category.trim(), income: Number(draft.income), expense: Number(draft.expense), createdBy: snapshot.member.id, createdAt: 0 };
    const data = { ...snapshot.data, entries: [...snapshot.data.entries.filter((item) => item.id !== entry.id), entry] };
    try { validateAccountingData(data); } catch { setFormError("日付・費目・金額を確認してください。収入と支出が両方0では登録できません。"); return; }
    if (await save(data)) setDraft(null);
  }
  async function remove(entry: AccountingEntry) {
    if (!snapshot || !window.confirm(`${entry.date}「${entry.category}」を削除しますか？`)) return;
    await save({ ...snapshot.data, entries: snapshot.data.entries.filter((item) => item.id !== entry.id) });
  }
  async function togglePayment(playerId: string, paid: boolean) {
    if (!snapshot) return;
    await save({ ...snapshot.data, payments: [...snapshot.data.payments.filter((payment) => payment.year !== year || payment.playerId !== playerId), { year, playerId, paid, paidAt: null }] });
  }

  const data = snapshot?.data;
  const paidIds = new Set(data?.payments.filter((payment) => payment.year === year && payment.paid).map((payment) => payment.playerId));
  const paidPlayers = data?.players.filter((player) => paidIds.has(player.id)) ?? [];
  const unpaidPlayers = data?.players.filter((player) => !paidIds.has(player.id)) ?? [];
  const currentYear = Number(japanDate().slice(0, 4));
  const years = [...new Set([year, ...Array.from({ length: 7 }, (_, index) => currentYear - 5 + index), ...(data?.payments.map((payment) => payment.year) ?? [])])].sort((a, b) => b - a);
  const disabled = busy || conflict || loading;
  return <main className={`app-shell ${styles.page}`}>
    <header className="topbar"><Link href="/" className="secondary"><ArrowLeft size={18} aria-hidden="true" />チームへ戻る</Link>{snapshot && <span className="login-member">{snapshot.member.name}</span>}</header>
    <div className="page-heading"><div><p className="eyebrow">YG TEAM</p><h1><WalletCards size={27} aria-hidden="true" /> 会計</h1><p>部費・収支管理 {snapshot && !canEdit && <b>／ 閲覧専用</b>}</p></div></div>
    {error && <div className="error-banner" role="alert"><span>{error}</span>{unauthorized ? <Link href="/">ログイン画面へ</Link> : <button type="button" disabled={busy} onClick={() => { void load(); }}>{conflict ? "最新データを読み込む" : "再読み込み"}</button>}</div>}
    {loading && !snapshot ? <LoadingState /> : data && !unauthorized && <>
      <section className={styles.balance} aria-label="現在残高"><span>現在残高</span><strong>{money(accountingBalance(data.entries))}</strong><small>全収入 − 全支出</small></section>
      <section className={styles.panel} aria-label="収支一覧"><div className={styles.sectionHeading}><h2>収支一覧</h2>{canEdit && <button type="button" className="primary" disabled={disabled} onClick={() => openEntry()}><Plus size={17} aria-hidden="true" />収支を登録</button>}</div>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th scope="col">日付</th><th scope="col">費目</th><th scope="col">収入</th><th scope="col">支出</th>{canEdit && <th scope="col">操作</th>}</tr></thead><tbody>
          {[...data.entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt || a.id.localeCompare(b.id)).map((entry) => <tr key={entry.id}><td>{entry.date}</td><td>{entry.category}</td><td>{money(entry.income)}</td><td>{money(entry.expense)}</td>{canEdit && <td><div className={styles.rowActions}><button type="button" className="secondary" disabled={disabled} aria-label={`${entry.date} ${entry.category}を編集`} onClick={() => openEntry(entry)}><Pencil size={14} aria-hidden="true" />編集</button><button type="button" className="danger-link" disabled={disabled} aria-label={`${entry.date} ${entry.category}を削除`} onClick={() => { void remove(entry); }}><Trash2 size={14} aria-hidden="true" />削除</button></div></td>}</tr>)}
          {!data.entries.length && <tr><td colSpan={canEdit ? 5 : 4}>収支はまだ登録されていません。</td></tr>}
        </tbody></table></div>
      </section>
      <section className={styles.panel} aria-label="部費支払状況"><div className={styles.sectionHeading}><h2>部費支払状況</h2><label className={styles.year}>年度<select aria-label="部費の年度" value={year} disabled={busy} onChange={(event) => setYear(Number(event.target.value))}>{years.map((value) => <option key={value} value={value}>{value}年度</option>)}</select></label></div>
        <div className={styles.yearNavigation}><button type="button" className="secondary" disabled={busy || year <= 1900} onClick={() => setYear(year - 1)}>前年度</button><strong>{year}年度</strong><button type="button" className="secondary" disabled={busy || year >= 9999} onClick={() => setYear(year + 1)}>翌年度</button></div>
        <p className={styles.paidCount}>支払済み <strong>{paidPlayers.length} / {data.players.length}</strong>人</p>
        {canEdit && <p className={styles.help}>支払状況変更：各メンバーのボタンで切り替えます。</p>}
        <div className={styles.groups}>{[{ title: "支払済み", players: paidPlayers, paid: true }, { title: "未払い", players: unpaidPlayers, paid: false }].map((group) => <div key={group.title}><h3>{group.title}</h3><ul>{group.players.map((player) => <li key={player.id}><span>{player.name}</span>{canEdit && <button type="button" className="secondary" disabled={disabled} aria-label={`${player.name}を${group.paid ? "未払い" : "支払済み"}に変更`} onClick={() => { void togglePayment(player.id, !group.paid); }}>{group.paid ? "未払いにする" : "支払済みにする"}</button>}</li>)}</ul>{!group.players.length && <p className={styles.help}>該当者はいません。</p>}</div>)}</div>
      </section>
      <p role="status" className={styles.help}>{busy ? "保存中…" : notice}</p>
    </>}
    <Modal open={draft !== null && canEdit && !unauthorized} onClose={() => { if (!busy) setDraft(null); }} title={data?.entries.some((entry) => entry.id === draft?.id) ? "収支を編集" : "収支を登録"}>
      {draft && <form onSubmit={(event) => { void submit(event); }} className={styles.form}>
        <label>日付<input required type="date" value={draft.date} disabled={disabled} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
        <label>費目<input required maxLength={100} value={draft.category} disabled={disabled} placeholder="例：部費・グラウンド代" onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
        <label>収入（円）<input required type="number" min="0" step="1" max={Number.MAX_SAFE_INTEGER} inputMode="numeric" value={draft.income} disabled={disabled} onChange={(event) => setDraft({ ...draft, income: event.target.value })} /></label>
        <label>支出（円）<input required type="number" min="0" step="1" max={Number.MAX_SAFE_INTEGER} inputMode="numeric" value={draft.expense} disabled={disabled} onChange={(event) => setDraft({ ...draft, expense: event.target.value })} /></label>
        {(formError || error) && <p role="alert" className="error-banner">{formError || error}</p>}
        {conflict && <button type="button" className="secondary" onClick={() => { void load(); }}>最新データを読み込む</button>}
        <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setDraft(null)}>キャンセル</button><button className="primary" type="submit" disabled={disabled}>{busy ? "保存中…" : "保存"}</button></div>
      </form>}
    </Modal>
  </main>;
}
