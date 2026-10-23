import type { ScheduleGame, ScheduleGameStatus, ScheduleResponse } from "@/lib/schedule";

export const ATTENDANCE = [
  { status: "attending", label: "参加", symbol: "○" },
  { status: "absent", label: "不参加", symbol: "×" },
  { status: "undecided", label: "未定", symbol: "△" },
] as const;

export const RESPONSE_FILTERS = [
  { status: "all", label: "全体" },
  ...ATTENDANCE,
  { status: "unanswered", label: "未回答" },
] as const;
export type ResponseFilter = typeof RESPONSE_FILTERS[number]["status"];

export const GAME_STATUSES: { status: ScheduleGameStatus; label: string }[] = [
  { status: "unconfirmed", label: "未確定" },
  { status: "proposed", label: "打診中" },
  { status: "confirmed", label: "確定" },
];

export type ResponseInput = Pick<ScheduleResponse, "status" | "comment">;

export type ScheduleEditorRequest = {
  requestId: string;
  gameId: string | null;
  date: string;
  startTime: string;
  title: string;
  opponent: string;
  location: string;
};

export const weekday = new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" });

export function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日（${weekday.format(new Date(`${date}T12:00:00+09:00`))}）`;
}

export type GameFields = Pick<ScheduleGame, "date" | "startTime" | "endTime" | "title" | "opponent" | "location" | "status" | "umpireArranged">;

export function gameFields(game: GameFields): GameFields {
  return { date: game.date, startTime: game.startTime, endTime: game.endTime, title: game.title, opponent: game.opponent, location: game.location, status: game.status, umpireArranged: game.umpireArranged };
}
