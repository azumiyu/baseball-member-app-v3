"use client";
import { useCallback, useMemo, useState } from "react";
import {
  absentPlayers,
  benchPlayers,
  type Player,
  type Position,
  type TeamData,
} from "@/lib/model";

import { useTeamData } from "./hooks/useTeamData";
import { useTeamUiState } from "./hooks/useTeamUiState";
import { usePdfExport } from "./hooks/usePdfExport";
import { useLineupTool } from "./hooks/useLineupTool";
import { EquipmentView } from "./equipment/EquipmentView";
import { StatsView } from "./stats/StatsView";
import { ScheduleView, type ScheduleEditorRequest } from "./schedule/ScheduleView";
import { createEntityId } from "@/lib/entity-id";

import {
  removePlayerUpdater,
  selectPlayerUpdater,
  setPositionUpdater,
  shiftOrderUpdater,
  toggleAbsentUpdater,
  upsertPlayerUpdater,
} from "./lib/lineup-actions";

import { LoginScreen } from "./LoginScreen";
import { TopBar } from "./TopBar";
import { PageHeading } from "./PageHeading";
import { TabNav } from "./TabNav";
import { ErrorBanner } from "./ErrorBanner";
import { MobileBottomBar } from "./MobileBottomBar";
import { LineupWorkspace } from "./lineup/LineupWorkspace";
import { RegistrationPanel } from "./roster/RegistrationPanel";

import { PlayerEditorModal } from "./modals/PlayerEditorModal";
import { PlayerPickerModal } from "./modals/PlayerPickerModal";
import { PositionPickerModal } from "./modals/PositionPickerModal";
import { SettingsModal } from "./modals/SettingsModal";
import { ReauthModal } from "./modals/ReauthModal";
import { PdfWarningModal } from "./modals/PdfWarningModal";
import { PdfReadyModal } from "./modals/PdfReadyModal";
import { AppMenuModal } from "./modals/AppMenuModal";
import type { SaveState } from "./types";
import { scheduleNameOptions } from "./lib/schedule-options";

/**
 * メンバー表アプリのルートコンポーネント。
 *
 * ここは「状態を集めて、子コンポーネントに配る」係に徹しています。
 *  - サーバー同期        → useTeamData
 *  - モーダルの開閉など  → useTeamUiState
 *  - PDF 出力            → usePdfExport
 *  - データ変換ロジック  → lib/lineup-actions.ts
 *
 * 新しい画面を足すときは components/team/ 配下にコンポーネントを作り、
 * ここから呼び出してください。
 */
export function TeamApp() {
  const team = useTeamData();
  const ui = useTeamUiState();
  const pdf = usePdfExport(team.data, team.setError);
  const [equipmentSaveState, setEquipmentSaveState] = useState<SaveState>("saved");
  const [statsSaveState, setStatsSaveState] = useState<SaveState>("saved");
  const [scheduleSaveState, setScheduleSaveState] = useState<SaveState>("saved");
  const [scheduleEditorRequest, setScheduleEditorRequest] = useState<ScheduleEditorRequest | null>(null);

  useLineupTool(team.data, team.auth);

  const { data, edit } = team;
  const canEditLineup = team.member?.canEditLineup === true;
  const lineupSwitching = data.scheduleId !== team.attendanceScheduleId;
  const canEditCurrentLineup = canEditLineup && !lineupSwitching;
  const editLineup = useCallback(
    (fn: (current: TeamData) => TeamData) => {
      if (canEditCurrentLineup) edit(fn);
    },
    [canEditCurrentLineup, edit],
  );
  const { pick, setPick, positionIndex, setPositionIndex, setEditor } = ui;

  const bench = useMemo(() => benchPlayers(data), [data]);
  const absent = useMemo(() => absentPlayers(data), [data]);

  /* ---------------- オーダー操作 ---------------- */

  const selectPlayer = useCallback(
    (playerId: string | null) => {
      if (!canEditLineup || pick === null) return;
      editLineup(selectPlayerUpdater(pick, playerId));
      setPick(null);
    },
    [canEditLineup, editLineup, pick, setPick],
  );

  const changePosition = useCallback(
    (position: Position) => {
      if (!canEditLineup || positionIndex === null) return;
      editLineup(setPositionUpdater(positionIndex, position));
      setPositionIndex(null);
    },
    [canEditLineup, editLineup, positionIndex, setPositionIndex],
  );

  /* ---------------- 名簿操作 ---------------- */

  const savePlayer = useCallback(
    (player: Player) => {
      if (!canEditLineup && player.id !== team.member?.id) return;
      edit((current) => {
        if (!canEditLineup && !current.players.some((p) => p.id === player.id)) return current;
        return upsertPlayerUpdater(player)(current);
      });
    },
    [canEditLineup, team.member?.id, edit],
  );

  const deletePlayer = useCallback(
    (player: Player) => {
      if (!canEditLineup) return;
      if (!window.confirm(`${player.name}さんを名簿から削除しますか？`)) return;
      editLineup(removePlayerUpdater(player.id));
      setEditor(null);
    },
    [canEditLineup, editLineup, setEditor],
  );

  const toggleAbsent = useCallback(
    (player: Player) => {
      if (!canEditLineup) return;
      editLineup(toggleAbsentUpdater(player.id));
      setEditor(null);
    },
    [canEditLineup, editLineup, setEditor],
  );

  /* ---------------- ログアウト ---------------- */

  const requestLogout = useCallback(async () => {
    if (
      (team.saveState !== "saved" || scheduleSaveState !== "saved") &&
      !window.confirm("未保存の変更があります。ログアウトしますか？")
    )
      return;
    await team.logout();
    setScheduleEditorRequest(null);
    ui.setSettings(false);
    pdf.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.saveState, scheduleSaveState, team.logout, ui.setSettings, pdf.clear]);

  /* ---------------- 未ログイン ---------------- */

  if (team.auth !== "ready" || !team.member) {
    return (
      <LoginScreen
        auth={team.auth}
        password={team.password}
        onPasswordChange={team.setPassword}
        onSubmit={team.login}
        loginMembers={team.loginMembers}
        selectedMemberId={team.selectedMemberId}
        onMemberChange={team.setSelectedMemberId}
        onChooseMember={team.chooseMember}
        busy={team.loginBusy}
        error={team.loginError}
        onBrandClick={() => ui.setAppMenuOpen(true)}
      />
    );
  }

  const appNavigation = (
    <TabNav
      tab={ui.tab}
      appView={ui.appView}
      onChange={ui.setTab}
      onViewChange={ui.setAppView}
      playerCount={data.players.length}
      saveState={
        ui.appView === "schedule"
          ? scheduleSaveState
          : ui.appView === "equipment"
            ? equipmentSaveState
            : ui.appView === "stats"
              ? statsSaveState
              : team.saveState
      }
    />
  );

  /* ---------------- 本画面 ---------------- */

  const nameOptions = scheduleNameOptions(team.schedules, {
    title: [...data.tournaments, data.tournament],
    opponent: [...data.opponents, data.opponent],
    location: [...data.locations, data.location],
  });

  return (
    <main className="app-shell">
      <TopBar
        memberName={team.member.name}
        onBrandClick={() => ui.setAppMenuOpen(true)}
        onSettingsClick={() => ui.setSettings(true)}
      />

      {/* タブ移動後も出欠の保存を完了し、ログイン時の未回答案内を表示する。 */}
      <div hidden={ui.appView !== "schedule"}>
        <ScheduleView
          key={team.member.id}
          players={data.players}
          member={team.member}
          nameOptions={nameOptions}
          appNavigation={appNavigation}
          isVisible={ui.appView === "schedule"}
          onOpenSchedule={() => ui.setAppView("schedule")}
          onSaveStateChange={setScheduleSaveState}
          onSaved={team.refreshIfIdle}
          remoteRevision={team.scheduleRevision}
          editorRequest={scheduleEditorRequest}
        />
      </div>

      {ui.appView === "equipment" ? (
        <EquipmentView
          key={team.member.id}
          players={data.players}
          appNavigation={appNavigation}
          onSaveStateChange={setEquipmentSaveState}
        />
      ) : ui.appView === "stats" ? (
        <StatsView
          key={team.member.id}
          member={team.member}
          players={data.players}
          appNavigation={appNavigation}
          onSaveStateChange={setStatsSaveState}
        />
      ) : ui.appView === "lineup" ? (
        <>
          <PageHeading
            teamName={data.teamName}
            pdfBusy={pdf.busy}
            pdfDisabled={pdf.disabled || lineupSwitching}
            pdfDisabledReason={lineupSwitching ? "選択した試合のスタメンを読み込んでいます。" : pdf.disabledReason}
            onCreatePdf={() => void pdf.create()}
          />

          {appNavigation}

          <ErrorBanner
            message={team.error}
            saveState={team.saveState}
            onReload={() => {
              if (
                window.confirm(
                  "画面上の未保存の変更を破棄し、最新データに置き換えますか？",
                )
              )
                void team.load().catch((e: Error) => team.setError(e.message));
            }}
            onRetry={() => {
              team.setError("");
              if (team.saveState === "error") team.setSaveState("dirty");
            }}
          />

          {ui.tab === "order" ? (
            <LineupWorkspace
              data={data}
              scheduleOptions={team.schedules}
              attendance={team.attendance}
              attendanceScheduleId={team.attendanceScheduleId}
              onOpenSchedule={() => {
                ui.setAppView("schedule");
                if (canEditLineup) setScheduleEditorRequest({ requestId: createEntityId(), gameId: data.scheduleId, date: data.date, startTime: data.startTime, title: data.tournament, opponent: data.opponent, location: data.location });
              }}
              edit={editLineup}
              readOnly={!canEditLineup}
              selectionDisabled={team.saveState !== "saved"}
              bench={bench}
              absent={absent}
              infoOpen={ui.infoOpen}
              onToggleInfo={() => ui.setInfoOpen(!ui.infoOpen)}
              onPickPlayer={ui.setPick}
              onPickPosition={ui.setPositionIndex}
              onEditPlayer={ui.setEditor}
              onAddPlayer={() => ui.setEditor("new")}
            />
          ) : (
            <RegistrationPanel
              key={team.member.id}
              canEditRoster={canEditLineup}
              memberId={team.member.id}
              players={data.players}
              bench={bench}
              absent={absent}
              onAddPlayer={() => ui.setEditor("new")}
              onEditPlayer={ui.setEditor}
            />
          )}

          <footer>{data.teamName} · メンバー表</footer>

          <MobileBottomBar
            tab={ui.tab}
            onToggleTab={() =>
              ui.setTab(ui.tab === "order" ? "players" : "order")
            }
            pdfBusy={pdf.busy}
            pdfDisabled={pdf.disabled || lineupSwitching}
            pdfDisabledReason={lineupSwitching ? "選択した試合のスタメンを読み込んでいます。" : pdf.disabledReason}
            onCreatePdf={() => void pdf.create()}
          />
        </>
      ) : null}

      {/* ------------------------- モーダル群 ------------------------- */}

      <ReauthModal
        open={team.reauth}
        onClose={() => team.setReauth(false)}
        onSuccess={team.resumeAfterReauth}
      />

      <PlayerEditorModal
        canEditLineup={canEditCurrentLineup}
        target={canEditLineup || (ui.editor !== null && ui.editor !== "new" && ui.editor.id === team.member.id) ? ui.editor : null}
        bench={bench}
        absent={absent}
        onClose={() => ui.setEditor(null)}
        onSave={savePlayer}
        onDelete={deletePlayer}
        onToggleAbsent={toggleAbsent}
      />

      <PlayerPickerModal
        target={canEditCurrentLineup ? ui.pick : null}
        players={data.players}
        bench={bench}
        absent={absent}
        slotCount={data.slots.length}
        onClose={() => ui.setPick(null)}
        onSelect={selectPlayer}
        onShiftOrder={(index, delta) => editLineup(shiftOrderUpdater(index, delta))}
        onAddPlayer={() => {
          ui.setPick(null);
          ui.setEditor("new");
        }}
      />

      <PositionPickerModal
        index={canEditCurrentLineup ? ui.positionIndex : null}
        data={data}
        onClose={() => ui.setPositionIndex(null)}
        onSelect={changePosition}
      />

      <SettingsModal
        open={ui.settings}
        member={team.member}
        teamName={data.teamName}
        manager={data.manager}
        saveState={team.saveState}
        error={team.error}
        onUpdateTeamInfo={(values) => {
          if (team.member?.isAdmin) edit((current) => ({ ...current, ...values }));
        }}
        onClose={() => ui.setSettings(false)}
        onRequestLogout={requestLogout}
      />

      <PdfWarningModal
        warnings={pdf.warnings}
        onClose={pdf.dismissWarnings}
        onForceCreate={() => void pdf.create(true)}
        onBackToInput={() => {
          pdf.dismissWarnings();
          ui.setInfoOpen(true);
        }}
      />

      <PdfReadyModal url={pdf.url} name={pdf.name} onClose={pdf.closePreview} />

      <AppMenuModal
        open={ui.appMenuOpen}
        onClose={() => ui.setAppMenuOpen(false)}
        onOpenLineup={() => {
          ui.setAppMenuOpen(false);
          ui.setAppView("lineup");
        }}
      />
    </main>
  );
}
