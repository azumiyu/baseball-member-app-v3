import type { ScheduleGame } from "./schedule";

/** 開始時刻の2時間後。日付をまたぐ場合は翌日の時刻。 */
export function defaultEndTime(startTime: string): string {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return "";
  const [hour, minute] = startTime.split(":").map(Number);
  return `${String((hour + 2) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function scheduleTimeRange(game: Pick<ScheduleGame, "startTime" | "endTime">): string {
  if (!game.startTime) return game.endTime ? `開始未定〜${game.endTime}` : "時刻未定";
  const nextDay = game.endTime && game.endTime < game.startTime ? "翌日" : "";
  return `${game.startTime}〜${nextDay}${game.endTime}`;
}

const STATUS_LABELS = { unconfirmed: "未確定", proposed: "打診中", confirmed: "確定" } as const;
const TEAM_URL = "https://site-creator-vinext-starter.hokuieren1212.workers.dev/";

export function scheduleShareText(game: Pick<ScheduleGame, "date" | "startTime" | "endTime" | "title" | "location" | "opponent" | "status">): string {
  const date = new Date(`${game.date}T00:00:00Z`);
  const weekday = "日月火水木金土"[date.getUTCDay()];
  return [
    `【${game.title || "大会名未定"}】※${STATUS_LABELS[game.status]}`,
    `日時: ${game.date.slice(5).replace("-", "/")}(${weekday})${scheduleTimeRange(game)}`,
    `場所: ${game.location || "未定"}`,
    `相手: ${game.opponent || "未定"}`,
    TEAM_URL,
    "から参加回答をお願いします！",
  ].join("\n");
}
