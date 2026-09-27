export type GameDefinition = {
  id: string;
  title: string;
  description: string;
  href: string;
  image: string;
  /** Display/documentation version. Use a new game ID for incompatible rankings. */
  version: number;
  scoreLabel: string;
  scoreUnit: string;
  scoreScale?: number;
  precision?: number;
};

/** Add a definition here when introducing another game to the team arcade. */
export const GAME_CATALOG: readonly GameDefinition[] = [
  {
    id: "kawataka-chinchiro",
    title: "川高の振れ！チンチロ！",
    description: "100万円から5回勝負。川高を相手に、サイコロ3個で最高記録を狙おう。",
    href: "/game/kawataka-chinchiro",
    image: "/game/kawataka.PNG",
    version: 1,
    scoreLabel: "最終持ち金",
    scoreUnit: "円",
  },
  {
    id: "oshino-fastball",
    title: "押野の出せ！剛速球！",
    description: "振りかぶって、リリースの一瞬を狙え。200.00 km/hへのシビアな一球勝負。",
    href: "/game/oshino-fastball",
    image: "/game/oshino.PNG",
    version: 1,
    scoreLabel: "最速球速",
    scoreUnit: "km/h",
    scoreScale: 100,
    precision: 2,
  },
];

export function getGame(id: string): GameDefinition | undefined {
  return GAME_CATALOG.find((game) => game.id === id);
}
