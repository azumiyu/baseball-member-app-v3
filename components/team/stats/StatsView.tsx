"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthMember } from "@/lib/auth-types";
import type { Player, TeamData } from "@/lib/model";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  emptyPlayerStats,
  parseGameKey,
  statsGameKeyForSchedule,
  MAX_REGISTERED_STATS_GAMES,
  type StatsScheduleOption,
  type PlayerStats,
  type StatsData,
} from "@/lib/stats";
import { japanDate } from "@/lib/schedule";
import { useStatsData } from "../hooks/useStatsData";
import type { SaveState } from "../types";
import { LoadingState } from "../common/LoadingState";
import { StatsEntryFields } from "./StatsEntryFields";
import { StatsConfirmation } from "./StatsConfirmation";
import { comparePlayersByNumber, removeStatsRegistration } from "./stats-actions";
import { compareScheduleChoices, defaultScheduleChoice, shortScheduleLabel } from "../lib/schedule-options";

const REGISTRATION_MESSAGE_MS = 1800;

function scheduleLabel(game: StatsScheduleOption) {
  return `${game.date.replaceAll("-", "/")} ${game.startTime || "時刻未定"} · ${game.title || "試合"}${game.opponent ? ` vs ${game.opponent}` : ""}`;
}

export function StatsView({
  players,
  currentLineup,
  member,
  appNavigation,
  onSaveStateChange,
}: {
  players: Player[];
  currentLineup?: Pick<TeamData, "scheduleId" | "slots">;
  member: AuthMember;
  appNavigation?: ReactNode;
  onSaveStateChange?: (state: SaveState) => void;
}) {
  const [registrationMessage, setRegistrationMessage] = useState("");
  const registrationTimer = useRef<number | null>(null);
  const stats = useStatsData();
  const [selectedPlayerId, setSelectedPlayerId] = useState(member.id);
  const [selection, setSelection] = useState<string | null>(null);
  const [showPastSchedules, setShowPastSchedules] = useState(false);
  const [linkScheduleId, setLinkScheduleId] = useState("");
  const [statsTab, setStatsTab] = useState<"entry" | "confirmation">("entry");
  const [openPlate, setOpenPlate] = useState<number | null>(null);
  const [registrationToDelete, setRegistrationToDelete] = useState<{
    gameKey: string;
    playerId: string;
    playerName: string;
    gameLabel: string;
  } | null>(null);
  const [entryDraft, setEntryDraft] = useState<{ key: string; values: PlayerStats } | null>(null);
  const scheduleById = new Map(stats.schedules.map((game) => [game.id, game]));
  const today = japanDate();
  const schedules = [...stats.schedules].sort(compareScheduleChoices);
  const visibleSchedules = schedules.filter((game) => showPastSchedules || game.date >= today);
  const defaultGame = defaultScheduleChoice(schedules);
  const selectedValue = selection ?? (defaultGame ? `schedule:${defaultGame.id}` : "");
  const selectedSchedule = selectedValue.startsWith("schedule:") ? scheduleById.get(selectedValue.slice(9)) : undefined;
  const legacyKey = selectedValue.startsWith("legacy:") ? selectedValue.slice(7) : "";
  const selectedGameKey = selectedSchedule ? statsGameKeyForSchedule(stats.data, selectedSchedule)
    : Object.hasOwn(stats.data.games, legacyKey) && !stats.data.scheduleIds[legacyKey] ? legacyKey : "";
  const selectedPlayer = players.find(
    (player) => player.id === (member.isAdmin ? selectedPlayerId : member.id),
  );
  const entryKey = JSON.stringify([selectedGameKey, selectedPlayer?.id]);
  const savedValues = stats.data.games[selectedGameKey]?.[selectedPlayer?.id ?? ""] ?? emptyPlayerStats();
  const draftValues = entryDraft?.key === entryKey ? entryDraft.values : savedValues;
  const hasDraftChanges = JSON.stringify(draftValues) !== JSON.stringify(savedValues);
  const labelForKey = (key: string) => {
    const schedule = scheduleById.get(stats.data.scheduleIds[key]);
    const game = parseGameKey(key);
    return schedule ? scheduleLabel(schedule) : game ? `${game.date.replaceAll("-", "/")}・${game.number}試合目（未連携）` : key;
  };
  useEffect(() => {
    return () => {
      if (registrationTimer.current !== null)
        window.clearTimeout(registrationTimer.current);
    };
  }, []);

  useEffect(() => {
    onSaveStateChange?.(stats.saveState);
  }, [stats.saveState, onSaveStateChange]);

  if (stats.loading)
    return <LoadingState label="成績データを読み込んでいます…" />;
  if (stats.error && stats.saveState === "saved") {
    return (
      <section className="panel stats-error">
        <p>{stats.error}</p>
        <button
          type="button"
          className="secondary"
          onClick={() => void stats.load()}
        >
          再読み込み
        </button>
      </section>
    );
  }

  const canEditPlayer = (playerId: string) =>
    member.isAdmin || playerId === member.id;
  const selectedValues = draftValues;
  const canRegister = Boolean(
    selectedGameKey &&
    selectedPlayer &&
    selectedValues.plateAppearances.some((result) => result !== null),
  );
  const isSaving = stats.saveState === "dirty" || stats.saveState === "saving";
  const selectablePlayers = players
    .filter((player) => canEditPlayer(player.id))
    .sort(comparePlayersByNumber);
  const clearRegistrationMessage = () => {
    if (registrationTimer.current !== null) {
      window.clearTimeout(registrationTimer.current);
      registrationTimer.current = null;
    }
    setRegistrationMessage("");
  };
  const canLeaveDraft = () => !hasDraftChanges || window.confirm("まだ登録していない成績の入力を破棄しますか？");
  const changeSelection = (value: string) => {
    if (!canLeaveDraft()) return false;
    setSelection(value);
    setEntryDraft(null);
    setLinkScheduleId("");
    setOpenPlate(null);
    clearRegistrationMessage();
    return true;
  };
  const editPlayer = (updater: (current: PlayerStats) => PlayerStats) => {
    if (!selectedGameKey || !selectedPlayer || !canEditPlayer(selectedPlayer.id))
      return;

    clearRegistrationMessage();

    setSelection(selectedValue);
    setEntryDraft((current) => ({ key: entryKey, values: updater(current?.key === entryKey ? current.values : savedValues) }));
  };

  const registeredGames = Object.keys(stats.data.games)
    .map((key) => ({ key, game: parseGameKey(key) }))
    .filter(
      (
        entry,
      ): entry is { key: string; game: { date: string; number: number } } =>
        entry.game !== null,
    )
    .sort(
      (a, b) =>
        (scheduleById.get(stats.data.scheduleIds[b.key])?.date ?? b.game.date)
          .localeCompare(scheduleById.get(stats.data.scheduleIds[a.key])?.date ?? a.game.date)
          || (scheduleById.get(stats.data.scheduleIds[b.key])?.startTime ?? "").localeCompare(scheduleById.get(stats.data.scheduleIds[a.key])?.startTime ?? "")
          || b.game.number - a.game.number,
    );
  const visibleLegacyGames = registeredGames.filter(({ key, game }) => !stats.data.scheduleIds[key] && (showPastSchedules || game.date >= today));
  const visibleRegisteredGames = registeredGames.slice(0, MAX_REGISTERED_STATS_GAMES);
  const editRegistration = (
    key: string,
    playerId: string,
  ) => {
    if (!canEditPlayer(playerId) || !canLeaveDraft()) return;
    clearRegistrationMessage();
    setSelection(stats.data.scheduleIds[key] ? `schedule:${stats.data.scheduleIds[key]}` : `legacy:${key}`);
    const date = scheduleById.get(stats.data.scheduleIds[key])?.date ?? parseGameKey(key)?.date;
    if (date && date < today) setShowPastSchedules(true);
    setSelectedPlayerId(playerId);
    setOpenPlate(null);
    setEntryDraft(null);
    setLinkScheduleId("");
    setStatsTab("entry");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const registerEntry = () => {
    if (!canRegister || !selectedPlayer || stats.saveState !== "saved") return;

    clearRegistrationMessage();
    setOpenPlate(null);

    stats.edit((current: StatsData) => ({
      ...current,
      scheduleIds: selectedSchedule ? { ...current.scheduleIds, [selectedGameKey]: selectedSchedule.id } : current.scheduleIds,
      games: {
        ...current.games,
        [selectedGameKey]: {
          ...(current.games[selectedGameKey] ?? {}),
          [selectedPlayer.id]: draftValues,
        },
      },
    }));
    setSelection(selectedValue);
    setEntryDraft(null);

    setRegistrationMessage("登録しました！");

    registrationTimer.current = window.setTimeout(() => {
      registrationTimer.current = null;
      setRegistrationMessage("");
    }, REGISTRATION_MESSAGE_MS);
  };
  const resetEntry = () => {
    if (!selectedPlayer || !canEditPlayer(selectedPlayer.id)) return;

    clearRegistrationMessage();
    setSelection(selectedValue);
    setEntryDraft({ key: entryKey, values: emptyPlayerStats() });
    setOpenPlate(null);
    setRegistrationMessage("リセットしました");
    registrationTimer.current = window.setTimeout(() => {
      registrationTimer.current = null;
      setRegistrationMessage("");
    }, REGISTRATION_MESSAGE_MS);
  };
  const deleteRegistration = (gameKeyToDelete: string, playerId: string) => {
    if (!canEditPlayer(playerId)) return;
    stats.edit((current) => removeStatsRegistration(current, gameKeyToDelete, playerId));
  };
  const linkLegacyGame = () => {
    if (!member.isAdmin || !selectedGameKey || stats.data.scheduleIds[selectedGameKey] || stats.saveState !== "saved" ||
        !schedules.some((game) => game.id === linkScheduleId) || Object.values(stats.data.scheduleIds).includes(linkScheduleId)) return;
    stats.edit((current) => ({ ...current, scheduleIds: { ...current.scheduleIds, [selectedGameKey]: linkScheduleId } }));
    setSelection(`schedule:${linkScheduleId}`);
    setLinkScheduleId("");
  };

  return (
    <section className="stats-page">
      <AlertDialog
        open={registrationToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setRegistrationToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この成績を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {registrationToDelete && `${registrationToDelete.gameLabel}の${registrationToDelete.playerName}さんの成績を削除します。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="stats-confirm-delete-action"
              onClick={() => {
                if (!registrationToDelete) return;
                deleteRegistration(registrationToDelete.gameKey, registrationToDelete.playerId);
                setRegistrationToDelete(null);
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <header className="page-heading">
        <div>
          <p className="eyebrow">GAME STATS</p>
          <h1>{statsTab === "confirmation" ? "成績登録確認" : "成績登録"}</h1>
          <p>
            {statsTab === "confirmation"
              ? "試合ごとの成績を確認できます。"
              : member.isAdmin
                ? "登録済みの試合・選手を選択して成績を入力してください。"
                : "登録済みの試合を選択して自分の成績を入力してください。"}
          </p>
        </div>
      </header>
      {appNavigation}
      {stats.error && (
        <div className="panel stats-error" role="alert">
          <p>{stats.error}</p>
          {stats.saveState === "error" && <button type="button" className="secondary" onClick={() => stats.edit((current) => current)}>保存を再試行</button>}
          <button type="button" className="secondary" onClick={() => {
            if (!window.confirm("未保存の変更を破棄して最新データを読み込みますか？")) return;
            setEntryDraft(null);
            setSelection(null);
            void stats.load();
          }}>最新データを読み込む</button>
        </div>
      )}
      <nav className="tabs stats-tabs" aria-label="成績画面切替">
        <button
          className={statsTab === "entry" ? "active" : ""}
          type="button"
          onClick={() => {
            setStatsTab("entry");
            setOpenPlate(null);
            clearRegistrationMessage();
          }}
        >
          成績入力
        </button>
        <button
          className={statsTab === "confirmation" ? "active" : ""}
          type="button"
          onClick={() => {
            setStatsTab("confirmation");
            setOpenPlate(null);
            clearRegistrationMessage();
          }}
        >
          成績登録確認
        </button>
      </nav>
      {statsTab === "confirmation" ? (
        <StatsConfirmation
          games={visibleRegisteredGames}
          data={stats.data}
          players={players}
          lineups={currentLineup?.scheduleId ? {
            ...stats.lineups,
            [currentLineup.scheduleId]: currentLineup.slots.map((slot) => slot.playerId),
          } : stats.lineups}
          canEditPlayer={canEditPlayer}
          gameLabel={labelForKey}
          onEdit={editRegistration}
          onDelete={(key, player) => setRegistrationToDelete({
            gameKey: key,
            playerId: player.id,
            playerName: player.name,
            gameLabel: labelForKey(key),
          })}
          onAdd={() => setStatsTab("entry")}
        />
      ) : (
        <div className="stats-entry-card panel">
          <div className="stats-game-fields">
            <div>
              <label htmlFor="stats-schedule">試合を選択</label>
              <select id="stats-schedule" className="stats-player-select" value={selectedValue} onChange={(event) => changeSelection(event.target.value)}>
                <option value="" disabled>登録済みの試合を選択してください</option>
                {visibleSchedules.map((game) => <option key={game.id} value={`schedule:${game.id}`}>{shortScheduleLabel(game, visibleSchedules)}</option>)}
                {visibleLegacyGames.length > 0 && <optgroup label="未連携の登録済み成績">
                  {visibleLegacyGames.map(({ key, game }) => <option key={key} value={`legacy:${key}`}>{game.date.slice(5).replace("-", "/")} 第{game.number}試合（未連携）</option>)}
                </optgroup>}
              </select>
              {selectedSchedule && <p className="stats-schedule-details">{selectedSchedule.startTime || "時刻未定"}{selectedSchedule.opponent && ` · vs ${selectedSchedule.opponent}`}{selectedSchedule.location && <span>{selectedSchedule.location}</span>}</p>}
              {!visibleSchedules.length && <p className="stats-schedule-details">{showPastSchedules ? "試合はまだ表示されていません。" : "本日以降の試合は登録されていません。"}新しい試合はスケジュール管理から登録できます。</p>}
              {showPastSchedules && (stats.hasMoreSchedules || stats.scheduleError) && <button type="button" className="secondary stats-load-schedules" disabled={stats.schedulesLoading} onClick={() => void stats.loadOlderSchedules()}>{stats.schedulesLoading ? "読み込み中…" : stats.scheduleError ? "過去の試合を再読み込み" : "さらに過去の試合を表示"}</button>}
              {showPastSchedules && stats.scheduleError && <p role="alert" className="stats-schedule-details">{stats.scheduleError}</p>}
            </div>
          </div>
          {selectedGameKey && !selectedSchedule && <div className="stats-legacy-link">
            <p>この成績はまだスケジュールの試合に紐づいていません。</p>
            {member.isAdmin ? <>
              <label htmlFor="stats-link-schedule">紐づける試合</label>
              <select id="stats-link-schedule" value={linkScheduleId} onChange={(event) => setLinkScheduleId(event.target.value)}>
                <option value="">試合を選択してください</option>
                {visibleSchedules.filter((game) => !Object.values(stats.data.scheduleIds).includes(game.id)).map((game) => <option key={game.id} value={game.id}>{shortScheduleLabel(game, visibleSchedules)}</option>)}
              </select>
              <button type="button" className="secondary" disabled={!linkScheduleId || stats.saveState !== "saved"} onClick={linkLegacyGame}>この試合に紐づける</button>
            </> : <p>紐づけは管理者が設定できます。登録済みの成績はそのまま編集できます。</p>}
          </div>}
          {member.isAdmin && (
            <div className="stats-player-field">
              <label htmlFor="stats-player">選手を選択</label>
              <select
                className="stats-player-select"
                id="stats-player"
                value={selectedPlayerId}
                onChange={(event) => {
                  if (!canLeaveDraft()) return;
                  setSelectedPlayerId(event.target.value);
                  setEntryDraft(null);
                  setOpenPlate(null);
                  clearRegistrationMessage();
                }}
              >
                <option value="">選手を選択してください</option>
                {selectablePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    #{player.number} {player.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedPlayer && selectedGameKey ? (
            <StatsEntryFields
              values={selectedValues}
              openPlate={openPlate}
              onOpenPlateChange={setOpenPlate}
              onChange={editPlayer}
            />
          ) : (
            <p className="stats-entry-placeholder">
              {!selectedGameKey
                ? "試合を選択してください。"
                : member.isAdmin
                  ? "選手を選択すると成績入力欄が表示されます。"
                  : "登録されている選手情報を確認できません。"}
            </p>
          )}
          <div className="stats-actions">
            <button
              type="button"
              className="primary"
              disabled={!canRegister || stats.saveState !== "saved"}
              onClick={registerEntry}
            >
              {isSaving ? "保存中…" : "登録する"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!selectedPlayer || !selectedGameKey}
              onClick={resetEntry}
            >
              入力をリセット
            </button>
          </div>
        </div>
      )}
      {registrationMessage && (
        <div
          className={`stats-register-toast${registrationMessage === "リセットしました" ? " reset" : ""}`}
          role="status"
          aria-live="polite"
        >
          ✓ {registrationMessage}
        </div>
      )}
    </section>
  );
}
