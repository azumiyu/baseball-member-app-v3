"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, Plus, RefreshCw, Target, Trash2, X } from "lucide-react";
import type { AuthMember } from "@/lib/auth-types";
import type { Player } from "@/lib/model";
import {
  PLAYER_GOAL_LIMIT,
  PLAYER_GOAL_METRICS,
  formatPlayerGoalTarget,
  type PlayerGoal,
  type PlayerGoalInput,
} from "@/lib/player-goals";
import type { PlayerGoalsResponse } from "@/lib/player-goals-store";
import { teamsOneCurrentYear, teamsOneYears } from "@/lib/teamsone-batters";
import { api } from "../lib/api";
import { comparePlayersByNumber } from "./stats-actions";

type Draft = PlayerGoalInput;

function newGoal(): Draft {
  return { title: "", kind: "batting", metric: "打率", targetValue: null, direction: "gte", manualProgress: 0, manualNote: "" };
}

function draftFromGoal(goal: PlayerGoal): Draft {
  return {
    title: goal.title,
    kind: goal.kind,
    metric: goal.metric,
    targetValue: goal.targetValue,
    direction: goal.direction,
    manualProgress: goal.manualProgress,
    manualNote: goal.manualNote,
  };
}

function goalProgressLabel(value: number) {
  return `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`;
}

function comparisonLabel(label: string, currentPercent: number, comparison: PlayerGoalsResponse["comparisons"]["week"]) {
  if (!comparison) return <span>{label}：比較履歴を蓄積中</span>;
  const delta = currentPercent - comparison.percent;
  const deltaLabel = `${delta > 0 ? "+" : ""}${delta.toLocaleString("ja-JP", { maximumFractionDigits: 1 })} pt`;
  return <span>{label}：{deltaLabel}<small>（{comparison.date.replaceAll("-", "/")} {comparison.achieved}/{comparison.total}件）</small></span>;
}

export function IndividualGoals({ active, member, players }: {
  active: boolean;
  member: AuthMember;
  players: Player[];
}) {
  const currentYear = teamsOneCurrentYear();
  const [year, setYear] = useState(currentYear);
  const [selectedPlayerId, setSelectedPlayerId] = useState(member.id);
  const [data, setData] = useState<PlayerGoalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ goalId: string | null; draft: Draft } | null>(null);
  const requestId = useRef(0);
  const alive = useRef(false);
  const visible = useRef(active);
  const roster = useMemo(() => {
    const all = players.some((player) => player.id === member.id)
      ? players : [...players, { id: member.id, name: member.name, number: member.number, kana: "" }];
    return [...all].sort(comparePlayersByNumber);
  }, [players, member.id, member.name, member.number]);
  const selectedPlayer = roster.find((player) => player.id === selectedPlayerId) ?? roster[0];
  const selectedGoals = data?.goals.filter((goal) => goal.playerId === selectedPlayer?.id) ?? [];
  const canEdit = !!selectedPlayer && (member.isAdmin || selectedPlayer.id === member.id);
  const years = [...new Set([...teamsOneYears(), 2026, currentYear])].sort((a, b) => b - a);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => { visible.current = active; }, [active]);

  const load = useCallback(async (refresh = false) => {
    const id = ++requestId.current;
    setError("");
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await api<PlayerGoalsResponse>(`/api/player-goals?year=${year}`);
      if (alive.current && visible.current && id === requestId.current) {
        setData(result);
        if (!result.players.some((player) => player.id === selectedPlayerId)) setSelectedPlayerId(member.id);
      }
    } catch (cause) {
      if (alive.current && visible.current && id === requestId.current) setError(cause instanceof Error ? cause.message : "個人目標を読み込めませんでした。");
    } finally {
      if (alive.current && id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [year, member.id, selectedPlayerId]);

  useEffect(() => {
    // Fetch when this lazy tab becomes visible; results are ignored after it unmounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) void load();
  }, [active, load]);

  const beginCreate = () => setEditor({ goalId: null, draft: newGoal() });
  const beginEdit = (goal: PlayerGoal) => setEditor({ goalId: goal.id, draft: draftFromGoal(goal) });
  const changeKind = (kind: Draft["kind"]) => setEditor((current) => {
    if (!current) return current;
    return { ...current, draft: kind === "manual"
      ? { ...current.draft, kind, metric: null, targetValue: null, direction: null, manualProgress: 0 }
      : { ...current.draft, kind, metric: PLAYER_GOAL_METRICS[kind][0] ?? "", targetValue: null, direction: "gte", manualProgress: 0 } };
  });
  const updateDraft = (patch: Partial<Draft>) => setEditor((current) => current
    ? { ...current, draft: { ...current.draft, ...patch } }
    : current);

  const saveGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !selectedPlayer || saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/player-goals", "POST", editor.goalId
        ? { action: "update", id: editor.goalId, goal: editor.draft }
        : { action: "create", playerId: selectedPlayer.id, year, goal: editor.draft });
      setEditor(null);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "目標を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const deleteGoal = async (goal: PlayerGoal) => {
    if (saving || !window.confirm(`「${goal.title}」を削除しますか？`)) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/player-goals", "POST", { action: "delete", id: goal.id });
      if (editor?.goalId === goal.id) setEditor(null);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "目標を削除できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const teamProgress = data?.teamProgress;
  const currentPercent = teamProgress?.percent ?? 0;
  const form = editor && <form className="player-goal-form" onSubmit={(event) => { void saveGoal(event); }}>
    <label>目標名<input required maxLength={100} value={editor.draft.title} onChange={(event) => updateDraft({ title: event.currentTarget.value })} placeholder="例：打率、球速 145 km/h" /></label>
    <label>達成率の集計<select value={editor.draft.kind} onChange={(event) => changeKind(event.currentTarget.value as Draft["kind"])}>
      <option value="batting">Teams.one 野手成績</option><option value="pitching">Teams.one 投手成績</option><option value="manual">自分で達成率を入力</option>
    </select></label>
    {editor.draft.kind === "manual" ? <>
      <label>達成率（%）<select value={editor.draft.manualProgress} onChange={(event) => updateDraft({ manualProgress: Number(event.currentTarget.value) })}>
        {Array.from({ length: 21 }, (_, index) => index * 5).map((value) => <option key={value} value={value}>{value}%</option>)}
      </select></label>
      <label>メモ<textarea maxLength={500} value={editor.draft.manualNote} onChange={(event) => updateDraft({ manualNote: event.currentTarget.value })} placeholder="例：現状126キロ" /></label>
    </> : <div className="player-goal-linked-fields">
      <label>成績項目<select value={editor.draft.metric ?? ""} onChange={(event) => updateDraft({ metric: event.currentTarget.value })}>
        {PLAYER_GOAL_METRICS[editor.draft.kind].map((metric) => <option key={metric} value={metric}>{metric}</option>)}
      </select></label>
      <label>目標値<input type="number" min="0.001" max="1000000" step="any" required value={editor.draft.targetValue ?? ""} onChange={(event) => updateDraft({ targetValue: event.currentTarget.value === "" ? null : Number(event.currentTarget.value) })} /></label>
      <label>達成条件<select value={editor.draft.direction ?? "gte"} onChange={(event) => updateDraft({ direction: event.currentTarget.value as "gte" | "lte" })}>
        <option value="gte">目標以上</option><option value="lte">目標以下</option>
      </select></label>
    </div>}
    <div className="player-goal-form-actions"><button type="submit" className="primary" disabled={saving}><Check size={15} aria-hidden="true" />{saving ? "保存中…" : "保存"}</button><button type="button" className="secondary" disabled={saving} onClick={() => setEditor(null)}><X size={15} aria-hidden="true" />キャンセル</button></div>
  </form>;

  return <section className="panel player-goals" aria-labelledby="player-goals-title" aria-busy={loading || refreshing}>
    <div className="player-goals-heading">
      <div><h2 id="player-goals-title"><Target size={19} aria-hidden="true" />個人目標</h2><p>Teams.oneの成績に連動した達成率と、自己入力の目標を確認できます。</p></div>
      <label className="player-goals-year">年度<select value={year} onChange={(event) => { setYear(Number(event.currentTarget.value)); setData(null); }}>
        {years.map((value) => <option key={value} value={value}>{value}年</option>)}
      </select></label>
    </div>

    <section className="team-goal-progress" aria-label="チーム目標達成率">
      <div className="team-goal-progress-top"><div><span>チーム目標達成率</span><strong>{teamProgress?.total ? `${currentPercent.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%` : "—"}</strong></div><span>{teamProgress?.achieved ?? 0} / {teamProgress?.total ?? 0} 件達成</span></div>
      <div className="team-goal-progress-track" role="meter" aria-label="チーム目標達成率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, currentPercent))}><span style={{ width: `${Math.min(100, currentPercent)}%` }} /></div>
      <p>全メンバーの各目標の達成率を平均しています。右側には達成した目標の件数を表示しています。</p>
      <div className="team-goal-comparisons">
        {comparisonLabel("先週比", currentPercent, data?.comparisons.week ?? null)}
        {comparisonLabel("1か月前比", currentPercent, data?.comparisons.month ?? null)}
      </div>
    </section>

    <div className="player-goals-toolbar">
      <label>目標を見る選手<select value={selectedPlayer?.id ?? ""} onChange={(event) => { setSelectedPlayerId(event.currentTarget.value); setEditor(null); }}>
        {roster.map((player) => <option key={player.id} value={player.id}>#{player.number} {player.name}</option>)}
      </select></label>
      <span>{selectedGoals.length} / {PLAYER_GOAL_LIMIT} 件</span>
      <button type="button" className="secondary" disabled={loading || refreshing} onClick={() => { void load(true); }}><RefreshCw size={14} aria-hidden="true" className={refreshing ? "is-spinning" : undefined} />更新</button>
    </div>

    {error && <p className="player-goal-error" role="alert">{error}</p>}
    {data?.statsUnavailable.length ? <p className="player-goal-note" role="status">Teams.oneの{data.statsUnavailable.map((kind) => kind === "batting" ? "野手" : "投手").join("・")}成績を取得できない目標は、再取得まで達成率を表示できません。</p> : null}
    {data?.statsStale.length ? <p className="player-goal-note" role="status">Teams.oneの{data.statsStale.map((kind) => kind === "batting" ? "野手" : "投手").join("・")}成績の最新取得に失敗したため、前回取得時の値で達成率を表示しています。</p> : null}
    {loading && !data && <p className="teamsone-batters-message" role="status">目標とTeams.oneの成績を読み込んでいます…</p>}

    {selectedPlayer && <div className="player-goals-list">
      <div className="player-goals-player-heading"><div><span>#{selectedPlayer.number}</span><h3>{selectedPlayer.name}の{year}年目標</h3></div>{canEdit && selectedGoals.length < PLAYER_GOAL_LIMIT && <button type="button" className="secondary" disabled={saving} onClick={beginCreate}><Plus size={15} aria-hidden="true" />目標を追加</button>}</div>
      {editor && form}
      {selectedGoals.length ? selectedGoals.map((goal) => {
        const progress = goal.progressPercent;
        const progressWidth = progress === null ? 0 : Math.min(100, Math.max(0, progress));
        const target = goal.kind === "manual" || goal.targetValue === null || !goal.direction
          ? null : formatPlayerGoalTarget(goal.metric ?? "", goal.targetValue, goal.direction);
        return <article className="player-goal-card" key={goal.id}>
          <div className="player-goal-card-top"><div><span className={`player-goal-status${goal.achieved ? " is-achieved" : ""}`}>{progress === null ? "成績未掲載" : goal.achieved ? "達成" : "挑戦中"}</span><h4>{goal.title}</h4><small>{goal.kind === "manual" ? "自己入力" : `Teams.one・${goal.metric}`}{target && ` ／ 目標 ${target}`}</small>{goal.kind === "manual" && goal.manualNote && <p className="player-goal-manual-note">メモ：{goal.manualNote}</p>}</div>{canEdit && <div className="player-goal-actions"><button type="button" className="secondary" disabled={saving} aria-label={`${goal.title}を編集`} onClick={() => beginEdit(goal)}>編集</button><button type="button" className="secondary" disabled={saving} aria-label={`${goal.title}を削除`} onClick={() => { void deleteGoal(goal); }}><Trash2 size={14} aria-hidden="true" /><span className="sr-only">削除</span></button></div>}</div>
          <div className="player-goal-progress-row"><span>{goal.kind === "manual" ? "自己入力の達成率" : `現在：${goal.actualValue ?? "Teams.one未掲載"}`}</span><strong>{progress === null ? "—" : goalProgressLabel(progress)}</strong></div>
          <div className="player-goal-progress-track" role="meter" aria-label={`${goal.title}の達成率`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressWidth)}><span style={{ width: `${progressWidth}%` }} /></div>
        </article>;
      }) : <p className="player-goals-empty">この年度の目標はまだありません。</p>}
      {canEdit && selectedGoals.length >= PLAYER_GOAL_LIMIT && <p className="player-goal-note">目標は1人につき最大10件です。</p>}
      {!canEdit && <p className="player-goal-note">目標の追加・編集は本人または管理者が行えます。</p>}
    </div>}
  </section>;
}
