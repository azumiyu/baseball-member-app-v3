"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { initialData, type TeamData } from "@/lib/model";
import type { AuthMember, AuthResponse, LoginMember } from "@/lib/auth-types";
import { api, type ApiError, type TeamLoadResponse, type TeamPollResponse } from "../lib/api";
import type { AuthState, SaveState } from "../types";
import { AUTOSAVE_DELAY_MS, TEAM_POLL_INTERVAL_MS } from "../lib/sync-config";
import { mergeSavedTeamData } from "../lib/team-save";

/**
 * チームデータのロード・自動保存・ログイン状態をまとめて扱うフック。
 *
 * ここが担当するのは「サーバーとの同期」だけで、画面の見た目には関与しません。
 *  - 起動時の認証チェック + 初回ロード
 *  - 変更から 650ms 後のデバウンス自動保存（楽観ロック: revision）
 *  - 60 秒ごとの条件付きポーリング（自分が編集中でないときだけ最新を取り込む）
 *  - 未保存のままページを離れようとしたときの警告
 */
export function useTeamData() {
  const [auth, setAuth] = useState<AuthState>("loading");
  const [data, setData] = useState<TeamData>(initialData);
  const [revision, setRevision] = useState(0);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const [schedules, setSchedules] = useState<TeamLoadResponse["schedules"]>([]);
  const [attendance, setAttendance] = useState<TeamLoadResponse["attendance"]>({});
  const [attendanceScheduleId, setAttendanceScheduleId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [reauth, setReauth] = useState(false);
  const [member, setMember] = useState<AuthMember | null>(null);
  const [loginMembers, setLoginMembers] = useState<LoginMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");

  // ログインフォーム
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  /** 最後にサーバーへ保存できた内容（JSON 文字列） */
  const saved = useRef("");
  /** 保存リクエストが飛んでいる最中かどうか */
  const saving = useRef(false);
  /** 取得後に編集・保存などが始まった場合、古いポーリング応答を破棄する。 */
  const syncVersion = useRef(0);
  /** 画面が今持っている内容。ポーリングの判定で参照する */
  const currentDraft = useRef("");
  useLayoutEffect(() => {
    currentDraft.current = JSON.stringify(data);
  }, [data]);

  /* ---------------- ロード ---------------- */

  const acceptData = useCallback((result: TeamLoadResponse) => {
    syncVersion.current += 1;
    saved.current = JSON.stringify(result.data);
    currentDraft.current = saved.current;
    setData(result.data);
    setRevision(result.revision);
    setScheduleRevision(result.scheduleRevision);
    setSchedules(result.schedules);
    setAttendance(result.attendance);
    setAttendanceScheduleId(result.attendanceScheduleId);
  }, []);

  const load = useCallback(async () => {
    syncVersion.current += 1;
    const result = await api<TeamLoadResponse>("/api/team");
    acceptData(result);
    setMember(result.member);
    setSaveState("saved");
    setError("");
    setAuth("ready");
  }, [acceptData]);

  /** 出欠の保存で変わったオーダーを、手元に未保存の編集がないときだけ反映する。 */
  const refreshIfIdle = useCallback(async () => {
    if (saving.current || currentDraft.current !== saved.current) return;
    const version = syncVersion.current;
    try {
      const result = await api<TeamLoadResponse>("/api/team");
      if (version !== syncVersion.current || saving.current || currentDraft.current !== saved.current || result.member.id !== member?.id) return;
      acceptData(result);
    } catch {
      // 一時的な通信失敗は通常の定期取得で再試行する。
    }
  }, [acceptData, member]);

  const acceptAuth = useCallback(async (result: AuthResponse) => {
    if (result.needsMemberSelection) {
      setMember(null);
      setLoginMembers(result.members ?? []);
      setSelectedMemberId("");
      setAuth("member-selection");
      return;
    }
    if (!result.authenticated || !result.member) {
      setMember(null);
      setLoginMembers([]);
      setSelectedMemberId("");
      setAuth("login");
      return;
    }
    setMember(result.member);
    setLoginMembers([]);
    setSelectedMemberId("");
    setAuth("loading");
    try {
      await load();
    } catch (err) {
      setAuth("login");
      throw err;
    }
  }, [load]);

  useEffect(() => {
    void api<AuthResponse>("/api/auth")
      .then(acceptAuth)
      .catch((e: Error) => {
        setLoginError(e.message);
        setAuth("login");
      });
  }, [acceptAuth]);

  /* ---------------- 編集 ---------------- */

  /** TeamData を書き換える唯一の入口。複製済みの draft を渡すので破壊的に触ってよい */
  const edit = useCallback((fn: (d: TeamData) => TeamData) => {
    syncVersion.current += 1;
    setData((current) => fn(structuredClone(current)));
    setSaveState((v) => (v === "conflict" ? v : "dirty"));
  }, []);

  /* ---------------- 自動保存 ---------------- */

  useEffect(() => {
    if (
      auth !== "ready" ||
      saveState !== "dirty" ||
      saving.current ||
      JSON.stringify(data) === saved.current
    )
      return;
    const timer = setTimeout(async () => {
      const payload = JSON.stringify(data);
      syncVersion.current += 1;
      saving.current = true;
      setSaveState("saving");
      try {
        const result = await api<TeamLoadResponse>("/api/team", "PUT", { data, revision });
        saved.current = JSON.stringify(result.data);
        setRevision(result.revision);
        if (currentDraft.current === payload) {
          acceptData(result);
          setSaveState("saved");
        } else {
          const latest = JSON.parse(currentDraft.current) as TeamData;
          const merged = mergeSavedTeamData(data, result.data, latest);
          acceptData(result);
          currentDraft.current = JSON.stringify(merged);
          setData(merged);
          setSaveState(currentDraft.current === saved.current ? "saved" : "dirty");
        }
        setError("");
      } catch (e) {
        const err = e as ApiError;
        setError(err.message);
        if (err.status === 401) setReauth(true);
        setSaveState(err.status === 409 ? "conflict" : "error");
      } finally {
        saving.current = false;
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [data, revision, auth, saveState, acceptData]);

  /** 保存済みの内容と一致したら "保存済み" 表示に戻す */
  useEffect(() => {
    if (
      saveState === "dirty" &&
      !saving.current &&
      JSON.stringify(data) === saved.current
    )
      setSaveState("saved");
  }, [data, saveState, revision]);

  /* ---------------- ポーリング ---------------- */

  useEffect(() => {
    if (auth !== "ready") return;
    let active = true;
    let polling = false;
    const id = setInterval(() => {
      if (
        polling ||
        saving.current ||
        currentDraft.current !== saved.current ||
        document.visibilityState !== "visible"
      )
        return;
      const requestVersion = syncVersion.current;
      polling = true;
      void api<TeamPollResponse>(`/api/team?revision=${revision}&scheduleRevision=${scheduleRevision}`)
        .then((r) => {
          if (!active) return;
          if (member?.id !== r.member.id) {
            // 別タブなどで端末のメンバーが変わった場合も、旧draftを送信しない。
            syncVersion.current += 1;
            setAuth("loading");
            setSaveState("saved");
            setMember(r.member);
            void load().catch((err: Error) => {
              setLoginError(err.message);
              setAuth("login");
            });
            return;
          }
          setMember((current) =>
            current?.id === r.member.id &&
            current.name === r.member.name &&
            current.number === r.member.number &&
            current.isAdmin === r.member.isAdmin &&
            current.canEditLineup === r.member.canEditLineup
              ? current
              : r.member,
          );
          if (
            active &&
            !r.unchanged &&
            !saving.current &&
            requestVersion === syncVersion.current &&
            currentDraft.current === saved.current &&
            document.visibilityState === "visible"
          ) {
            acceptData(r);
          }
        })
        .catch(() => {})
        .finally(() => { polling = false; });
    }, TEAM_POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [auth, data, revision, scheduleRevision, member?.id, load, acceptData]);

  /* ---------------- 離脱警告 ---------------- */

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        (saving.current || JSON.stringify(data) !== saved.current) &&
        auth === "ready"
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [data, auth]);

  /* ---------------- 認証 ---------------- */

  const login = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loginBusy) return;
      setLoginBusy(true);
      setLoginError("");
      try {
        const result = await api<AuthResponse>("/api/auth", "POST", { password });
        setPassword("");
        await acceptAuth(result);
      } catch (err) {
        setLoginError((err as Error).message);
      } finally {
        setLoginBusy(false);
      }
    },
    [password, loginBusy, acceptAuth],
  );

  const chooseMember = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedMemberId || loginBusy) return;
      setLoginBusy(true);
      setLoginError("");
      try {
        const result = await api<AuthResponse>("/api/auth", "PATCH", {
          playerId: selectedMemberId,
        });
        await acceptAuth(result);
      } catch (err) {
        setLoginError((err as Error).message);
        if ((err as ApiError).status === 401) {
          setLoginMembers([]);
          setSelectedMemberId("");
          setAuth("login");
        }
      } finally {
        setLoginBusy(false);
      }
    },
    [selectedMemberId, loginBusy, acceptAuth],
  );

  /** ログアウト。失敗した場合は呼び出し側で catch してメッセージを出す */
  const logout = useCallback(async () => {
    syncVersion.current += 1;
    await api("/api/auth", "DELETE");
    saved.current = "";
    setData(initialData());
    setRevision(0);
    setScheduleRevision(0);
    setSchedules([]);
    setAttendance({});
    setAttendanceScheduleId(null);
    setSaveState("saved");
    setMember(null);
    setLoginMembers([]);
    setSelectedMemberId("");
    setPassword("");
    setLoginError("");
    setReauth(false);
    setAuth("login");
    setError("");
  }, []);

  /** 再ログイン成功後、保存を再開する */
  const resumeAfterReauth = useCallback(async (nextMember: AuthMember) => {
    setMember(nextMember);
    setReauth(false);
    setError("");
    if (member?.id !== nextMember.id) {
      // 別のメンバーで再認証した場合、前のメンバーの編集内容を送信しない。
      syncVersion.current += 1;
      setAuth("loading");
      setSaveState("saved");
      try {
        await load();
      } catch (err) {
        setLoginError((err as Error).message);
        setAuth("login");
      }
      return;
    }
    setSaveState("dirty");
  }, [member?.id, load]);

  return {
    // データ
    auth,
    data,
    edit,
    revision,
    load,
    refreshIfIdle,
    scheduleRevision,
    schedules,
    attendance,
    attendanceScheduleId,
    // 保存状態
    saveState,
    setSaveState,
    error,
    setError,
    // 認証
    member,
    loginMembers,
    selectedMemberId,
    setSelectedMemberId,
    chooseMember,
    password,
    setPassword,
    loginBusy,
    loginError,
    login,
    logout,
    reauth,
    setReauth,
    resumeAfterReauth,
  };
}
