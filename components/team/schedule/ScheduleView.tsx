"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Plus } from "lucide-react";
import type { AuthMember } from "@/lib/auth-types";
import type { Player } from "@/lib/model";
import { defaultEndTime } from "@/lib/schedule-format";
import { japanDate, upcomingSaturday, type ScheduleGame } from "@/lib/schedule";
import { useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { LoadingState } from "../common/LoadingState";
import { compareScheduleChoices, defaultScheduleChoice, scheduleNameOptions, type ScheduleNameOptions } from "../lib/schedule-options";
import { useScheduleData } from "../hooks/useScheduleData";
import type { SaveState } from "../types";
import { ScheduleNotices } from "./ScheduleNotices";
import { ScheduleGameCard } from "./ScheduleGameCard";
import { ScheduleGameEditor } from "./ScheduleGameEditor";
import { ScheduleResponsesModal } from "./ScheduleResponsesModal";
import { formatDate, type GameFields, type ResponseFilter, type ResponseInput, type ScheduleEditorRequest } from "./schedule-presentation";

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
  const card = (game: ScheduleGame) => <ScheduleGameCard key={game.id} game={game} players={sortedPlayers} member={member} featured={game.date === featuredDate} expanded={expandedGameId === game.id} onToggle={() => setExpandedGameId((current) => current === game.id ? null : game.id)} disabled={blocked} onEdit={member.canEditLineup ? () => setEditor(game) : undefined} onResponse={(playerId, response) => updateResponse(game.id, playerId, response)} onOpenResponses={(filter) => setResponseView({ gameId: game.id, filter })} />;

  return (
    <section className="schedule-page">
      {schedule.loginGames && <ScheduleNotices games={schedule.data.games} initialGames={schedule.loginGames} memberId={member.id} suspended={editor !== null || responseGame !== undefined || schedule.loading} saveState={schedule.saveState} error={schedule.error} onResponse={(id, response) => updateResponse(id, member.id, response)} onRetry={schedule.retrySave} onOpenSchedule={(id) => { setExpandedGameId(id); onOpenSchedule(); }} />}
      <header className="page-heading ">
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
      {editor !== null && <ScheduleGameEditor key={editor === "new" ? "new" : editor.id} game={editor === "new" ? undefined : editor} defaultDate={defaultDate} defaults={newGameDefaults} visible={isVisible} saveState={schedule.saveState} saveError={saveFailed ? schedule.error : ""} nameOptions={options} onSave={saveGame} onDelete={deleteGame} onClose={() => setEditor(null)} />}
      {responseView && responseGame && <ScheduleResponsesModal key={responseGame.id} game={responseGame} players={sortedPlayers} member={member} filter={responseView.filter} open={isVisible && editor === null} disabled={blocked} saveState={schedule.saveState} error={saveFailed ? schedule.error : ""} onFilterChange={(filter) => setResponseView({ gameId: responseGame.id, filter })} onResponse={(playerId, response) => updateResponse(responseGame.id, playerId, response)} onRetry={schedule.retrySave} onClose={() => setResponseView(null)} />}
    </section>
  );
}
