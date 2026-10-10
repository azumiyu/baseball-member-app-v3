import type { Player } from "@/lib/model";
import type { PlateAppearanceResult, PlayerStats, StatsData } from "@/lib/stats";

type StatsNumberField = Exclude<keyof PlayerStats, "plateAppearances" | "scoringPosition">;

export function comparePlayersByNumber(a: Player, b: Player): number {
  const difference = Number(a.number) - Number(b.number);
  return Number.isNaN(difference)
    ? a.number.localeCompare(b.number, "ja")
    : difference;
}

/** 空いている打順も数え、オーダー外の選手は打順のある選手の後ろに表示する。 */
export function registeredPlayersByBattingOrder(
  players: Player[],
  game: StatsData["games"][string],
  lineup: Array<string | null> = [],
): Array<{ player: Player; battingOrder: number | undefined }> {
  const battingOrders = new Map<string, number>();
  lineup.forEach((playerId, index) => {
    if (playerId && !battingOrders.has(playerId)) battingOrders.set(playerId, index + 1);
  });
  return players
    .filter((player) => game?.[player.id])
    .map((player) => ({ player, battingOrder: battingOrders.get(player.id) }))
    .sort((a, b) =>
      (a.battingOrder ?? Infinity) - (b.battingOrder ?? Infinity)
      || comparePlayersByNumber(a.player, b.player),
    );
}

export function updatePlateAppearance(
  current: PlayerStats,
  index: number,
  result: PlateAppearanceResult | null,
): PlayerStats {
  const plateAppearances = [...current.plateAppearances];
  const scoringPosition = [...current.scoringPosition];
  plateAppearances[index] = result;
  if (result === null) scoringPosition[index] = false;
  return { ...current, plateAppearances, scoringPosition };
}

export function addPlateAppearance(current: PlayerStats): PlayerStats {
  return {
    ...current,
    plateAppearances: [...current.plateAppearances, null],
    scoringPosition: [...current.scoringPosition, false],
  };
}

export function updateScoringPosition(current: PlayerStats, index: number, checked: boolean): PlayerStats {
  const scoringPosition = [...current.scoringPosition];
  scoringPosition[index] = checked;
  return { ...current, scoringPosition };
}

export function updateStatsNumber(current: PlayerStats, field: StatsNumberField, value: string): PlayerStats {
  return { ...current, [field]: Math.max(0, Number.parseInt(value, 10) || 0) };
}

/** 最後の選手の成績を削除した場合だけ、試合と予定の紐付けも削除する。 */
export function removeStatsRegistration(current: StatsData, gameKey: string, playerId: string): StatsData {
  const game = { ...(current.games[gameKey] ?? {}) };
  delete game[playerId];
  const games = { ...current.games };
  if (Object.keys(game).length === 0) delete games[gameKey];
  else games[gameKey] = game;
  const scheduleIds = { ...current.scheduleIds };
  if (!games[gameKey]) delete scheduleIds[gameKey];
  return { ...current, games, scheduleIds };
}
