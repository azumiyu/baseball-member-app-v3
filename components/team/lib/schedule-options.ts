import { japanDate, upcomingSaturday, type ScheduleGame } from "@/lib/schedule";

type ScheduleChoice = Pick<ScheduleGame, "id" | "date" | "title" | "startTime">;

export function compareScheduleChoices(a: ScheduleChoice, b: ScheduleChoice) {
  return a.date.localeCompare(b.date)
    || (a.startTime || "99:99").localeCompare(b.startTime || "99:99")
    || a.id.localeCompare(b.id);
}

export function defaultScheduleChoice<T extends ScheduleChoice>(games: readonly T[], now = new Date()): T | undefined {
  const sorted = [...games].sort(compareScheduleChoices);
  return sorted.find((game) => game.date === japanDate(now))
    ?? sorted.find((game) => game.date === upcomingSaturday(now));
}

/** 通常は月日と試合名だけ。同じ表示になる試合に限り識別用の情報を添える。 */
export function shortScheduleLabel(game: ScheduleChoice, choices: readonly ScheduleChoice[] = []) {
  const label = `${game.date.slice(5).replace("-", "/")} ${game.title || "試合"}`;
  const duplicates = choices.filter((other) => other.date.slice(5) === game.date.slice(5) && (other.title || "試合") === (game.title || "試合"));
  if (duplicates.length < 2) return label;
  const sameDay = duplicates.filter((other) => other.date === game.date).sort(compareScheduleChoices);
  const year = duplicates.some((other) => other.date !== game.date) ? `${game.date.slice(0, 4)}年` : "";
  const detail = sameDay.length < 2 ? "" : game.startTime && sameDay.filter((other) => other.startTime === game.startTime).length === 1
    ? game.startTime : `第${sameDay.findIndex((other) => other.id === game.id) + 1}試合`;
  return `${label}（${[year, detail].filter(Boolean).join(" ")}）`;
}

export type ScheduleNameOptions = { title: string[]; opponent: string[]; location: string[] };

/** 取得済みのオーダー候補と予定の履歴を使い、検索用の追加通信を避ける。 */
export function scheduleNameOptions(
  games: ReadonlyArray<Pick<ScheduleGame, "title" | "opponent" | "location">>,
  existing: ScheduleNameOptions,
): ScheduleNameOptions {
  const names = (field: keyof ScheduleNameOptions) => [...new Set([
    ...existing[field], ...games.map((game) => game[field]),
  ].map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  return { title: names("title"), opponent: names("opponent"), location: names("location") };
}
