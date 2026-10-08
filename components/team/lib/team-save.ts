import type { TeamData } from "@/lib/model";

const SHARED_FIELDS = new Set<keyof TeamData>([
  "players", "teamName", "manager", "tournaments", "opponents", "locations",
]);

/** 保存中に追加された編集を、サーバーが復元した試合のスタメンに重ねる。 */
export function mergeSavedTeamData(sent: TeamData, saved: TeamData, latest: TeamData): TeamData {
  // 週次更新で試合が切り替わった場合、前の試合の配置を新しい試合へ持ち込まない。
  const rolledOver = saved.scheduleId !== sent.scheduleId;
  const following = Object.fromEntries(Object.entries(latest).filter(([key, value]) =>
    (!rolledOver || SHARED_FIELDS.has(key as keyof TeamData)) &&
    JSON.stringify(value) !== JSON.stringify(sent[key as keyof TeamData])));
  return { ...saved, ...following } as TeamData;
}
