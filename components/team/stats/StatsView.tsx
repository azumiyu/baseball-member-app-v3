"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthMember } from "@/lib/auth-types";
import type { Player } from "@/lib/model";
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
  PLATE_APPEARANCE_RESULTS,
  type StatsScheduleOption,
  type PlateAppearanceResult,
  type PlayerStats,
  type StatsData,
} from "@/lib/stats";
import { japanDate } from "@/lib/schedule";
import { useStatsData } from "../hooks/useStatsData";
import type { SaveState } from "../types";
import { LoadingState } from "../common/LoadingState";
import { StatsValues } from "./StatsValues";
import { isHitResult } from "./stats-summary";
import { compareScheduleChoices, defaultScheduleChoice, shortScheduleLabel } from "../lib/schedule-options";

const NUMBER_FIELDS = [
  ["rbis", "打点"],
  ["runs", "得点"],
  ["stolenBases", "盗塁"],
  ["caughtStealingAttempts", "盗塁死"],
  ["errors", "失策"],
  ["caughtStealing", "盗塁阻止"],
] as const;
const CONFIRMATION_PAGE_SIZE = 5;
const STAT_NUMBER_OPTIONS = Array.from({ length: 11 }, (_, index) => index);
const RBIS_NUMBER_OPTIONS = Array.from({ length: 21 }, (_, index) => index);
const REGISTRATION_MESSAGE_MS = 1800;

function scheduleLabel(game: StatsScheduleOption) {
  return `${game.date.replaceAll("-", "/")} ${game.startTime || "時刻未定"} · ${game.title || "試合"}${game.opponent ? ` vs ${game.opponent}` : ""}`;
}

export function StatsView({
  players,
  member,
  appNavigation,
  onSaveStateChange,
}: {
  players: Player[];
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
  const [confirmationPage, setConfirmationPage] = useState(1);
  const [gameToDelete, setGameToDelete] = useState<{
    key: string;
    label: string;
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

  useEffect(() => {
    if (openPlate === null) return;
    const closeOnOutsideInteraction = (event: FocusEvent | PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest(".plate-entry")?.getAttribute("data-plate-index") !==
          String(openPlate)
      )
        setOpenPlate(null);
    };
    document.addEventListener("focusin", closeOnOutsideInteraction);
    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    return () => {
      document.removeEventListener("focusin", closeOnOutsideInteraction);
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
    };
  }, [openPlate]);
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
  const sortByNumber = (a: Player, b: Player) => {
    const numberDiff = Number(a.number) - Number(b.number);
    return Number.isNaN(numberDiff)
      ? a.number.localeCompare(b.number, "ja")
      : numberDiff;
  };
  const selectablePlayers = players
    .filter((player) => canEditPlayer(player.id))
    .sort(sortByNumber);
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
  const togglePastSchedules = () => {
    if (showPastSchedules && ((selectedSchedule && selectedSchedule.date < today) || (legacyKey && (parseGameKey(legacyKey)?.date ?? "") < today))) {
      if (!changeSelection(defaultGame ? `schedule:${defaultGame.id}` : "")) return;
    }
    if (showPastSchedules) setLinkScheduleId("");
    setShowPastSchedules((current) => !current);
  };
  const editPlayer = (updater: (current: PlayerStats) => PlayerStats) => {
    if (!selectedGameKey || !selectedPlayer || !canEditPlayer(selectedPlayer.id))
      return;

    clearRegistrationMessage();

    setSelection(selectedValue);
    setEntryDraft((current) => ({ key: entryKey, values: updater(current?.key === entryKey ? current.values : savedValues) }));
  };

  const updatePlate = (index: number, result: PlateAppearanceResult | null) => {
    editPlayer((current) => {
      const plateAppearances = [...current.plateAppearances];
      plateAppearances[index] = result;
      const scoringPosition = [...current.scoringPosition];
      if (result === null) scoringPosition[index] = false;
      return { ...current, plateAppearances, scoringPosition };
    });
    setOpenPlate(null);
  };
  const addPlate = () =>
    editPlayer((current) => ({
      ...current,
      plateAppearances: [...current.plateAppearances, null],
      scoringPosition: [...current.scoringPosition, false],
    }));
  const updateScoringPosition = (index: number, checked: boolean) =>
    editPlayer((current) => {
      const scoringPosition = [...current.scoringPosition];
      scoringPosition[index] = checked;
      return { ...current, scoringPosition };
    });
  const updateNumber = (
    field: (typeof NUMBER_FIELDS)[number][0],
    value: string,
  ) =>
    editPlayer((current) => ({
      ...current,
      [field]: Math.max(0, Number.parseInt(value, 10) || 0),
    }));
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
          || a.game.number - b.game.number,
    );
  const confirmationPageCount = Math.max(
    1,
    Math.ceil(registeredGames.length / CONFIRMATION_PAGE_SIZE),
  );
  const visibleLegacyGames = registeredGames.filter(({ key, game }) => !stats.data.scheduleIds[key] && (showPastSchedules || game.date >= today));
  const currentConfirmationPage = Math.min(
    confirmationPage,
    confirmationPageCount,
  );
  const visibleRegisteredGames = registeredGames.slice(
    (currentConfirmationPage - 1) * CONFIRMATION_PAGE_SIZE,
    currentConfirmationPage * CONFIRMATION_PAGE_SIZE,
  );
  const changeConfirmationPage = (page: number) => {
    setConfirmationPage(page);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
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
    stats.edit((current: StatsData) => {
      const game = { ...(current.games[gameKeyToDelete] ?? {}) };
      delete game[playerId];
      const games = { ...current.games };
      if (Object.keys(game).length === 0) delete games[gameKeyToDelete];
      else games[gameKeyToDelete] = game;
      const scheduleIds = { ...current.scheduleIds };
      if (!games[gameKeyToDelete]) delete scheduleIds[gameKeyToDelete];
      return { ...current, games, scheduleIds };
    });
  };
  const deleteGameRegistration = (gameKeyToDelete: string) => {
    if (!member.isAdmin) return;
    setGameToDelete({ key: gameKeyToDelete, label: labelForKey(gameKeyToDelete) });
  };
  const confirmDeleteGameRegistration = () => {
    if (!gameToDelete) return;
    stats.edit((current: StatsData) => {
      const games = { ...current.games };
      delete games[gameToDelete.key];
      const scheduleIds = { ...current.scheduleIds };
      delete scheduleIds[gameToDelete.key];
      return { ...current, games, scheduleIds };
    });
    setGameToDelete(null);
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
        open={gameToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setGameToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この試合の成績を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {gameToDelete
                ? `${gameToDelete.label}の成績をすべて削除します。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteGameRegistration}>
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
        <>
          <div className="stats-confirm-list">
            {registeredGames.length === 0 ? (
              <div className="panel">
                <p className="stats-empty">まだ成績が登録されていません。</p>
              </div>
            ) : (
              visibleRegisteredGames.map(({ key }, index) => (
                <section className="stats-game-group" key={key}>
                  <div className={`stats-game-heading ${index === 0 ? 'is-first' : ''}`}>
                    <h2>
                      {labelForKey(key)}
                    </h2>
                    {member.isAdmin && (
                      <button
                        type="button"
                        className="stats-delete-button"
                        onClick={() => deleteGameRegistration(key)}
                      >
                        この試合を削除
                      </button>
                    )}
                  </div>
                  <div className="panel">
                    {players
                      .filter((player) => stats.data.games[key]?.[player.id])
                      .sort(sortByNumber)
                      .map((player) => (
                        <StatsValues
                          key={player.id}
                          player={player}
                          values={stats.data.games[key][player.id]}
                          canEdit={canEditPlayer(player.id)}
                          onEdit={() => editRegistration(key, player.id)}
                          onDelete={() => deleteRegistration(key, player.id)}
                        />
                      ))}
                  </div>
                </section>
              ))
            )}
          </div>
          {confirmationPageCount > 1 && (
            <nav className="stats-pagination" aria-label="成績登録確認ページ">
              <button
                type="button"
                className="secondary"
                disabled={currentConfirmationPage === 1}
                onClick={() =>
                  changeConfirmationPage(currentConfirmationPage - 1)
                }
              >
                前へ
              </button>
              <span>
                {currentConfirmationPage} / {confirmationPageCount}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={currentConfirmationPage === confirmationPageCount}
                onClick={() =>
                  changeConfirmationPage(currentConfirmationPage + 1)
                }
              >
                次へ
              </button>
            </nav>
          )}
          <div className="stats-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setStatsTab("entry")}
            >
              成績を追加登録
            </button>
          </div>
        </>
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
              {/* <button type="button" className="secondary stats-load-schedules" aria-pressed={showPastSchedules} onClick={togglePastSchedules}>{showPastSchedules ? "過去の試合を非表示" : "過去の試合も表示"}</button> */}
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
            <>
              <h2 className="stats-section-heading">打席結果</h2>
              <div className="plate-entry-grid">
                {selectedValues.plateAppearances.map(
                  (result: PlateAppearanceResult | null, index: number) => (
                    <div
                      className="plate-entry"
                      data-plate-index={index}
                      key={index}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && openPlate === index) {
                          event.preventDefault();
                          setOpenPlate(null);
                          event.currentTarget
                            .querySelector<HTMLButtonElement>(".plate-square")
                            ?.focus();
                        }
                      }}
                      onBlur={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        )
                          setOpenPlate(null);
                      }}
                    >
                      <button
                        type="button"
                        className={`plate-square ${result ? "filled" : ""}${isHitResult(result) ? " hit-result" : ""}`}
                        aria-expanded={openPlate === index}
                        aria-controls={
                          openPlate === index
                            ? `plate-result-menu-${index}`
                            : undefined
                        }
                        onClick={() =>
                          setOpenPlate(openPlate === index ? null : index)
                        }
                      >
                        <small>{index + 1}打席目</small>
                        <strong>{result ?? "選択"}</strong>
                      </button>
                      {openPlate === index && (
                        <div
                          className="plate-result-menu"
                          id={`plate-result-menu-${index}`}
                          role="group"
                          aria-label={`${index + 1}打席目の結果`}
                          onClick={(event) => {
                            event.currentTarget
                              .closest(".plate-entry")
                              ?.querySelector<HTMLButtonElement>(
                                ".plate-square",
                              )
                              ?.focus();
                          }}
                        >
                          {PLATE_APPEARANCE_RESULTS.map((option) => (
                            <button
                              type="button"
                              key={option}
                              aria-pressed={result === option}
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={() => updatePlate(index, option)}
                            >
                              {option}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="plate-clear-button"
                            disabled={
                              result === null &&
                              selectedValues.scoringPosition[index] !== true
                            }
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => updatePlate(index, null)}
                          >
                            未入力に戻す
                          </button>
                        </div>
                      )}
                      <label className="scoring-position-field">
                        <span>得点圏</span>
                        <input
                          type="checkbox"
                          aria-label={`${index + 1}打席目の得点圏`}
                          checked={
                            selectedValues.scoringPosition[index] === true
                          }
                          onChange={(event) =>
                            updateScoringPosition(index, event.target.checked)
                          }
                        />
                      </label>
                    </div>
                  ),
                )}
                <button
                  type="button"
                  className="plate-add-button"
                  onClick={addPlate}
                  aria-label="打席を追加"
                >
                  ＋<small>打席追加</small>
                </button>
              </div>
              <h2 className="stats-section-heading">その他の成績</h2>
              <div className="stats-number-grid">
                {NUMBER_FIELDS.map(([field, label]) => (
                  <label key={field} htmlFor={`stat-${field}`}>
                    <span>{label}</span>
                    <select
                      id={`stat-${field}`}
                      value={selectedValues[field]}
                      onChange={(event) =>
                        updateNumber(field, event.target.value)
                      }
                    >
                      {(field === "rbis"
                        ? RBIS_NUMBER_OPTIONS
                        : STAT_NUMBER_OPTIONS
                      ).map((number) => (
                        <option key={number} value={number}>
                          {number}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
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
