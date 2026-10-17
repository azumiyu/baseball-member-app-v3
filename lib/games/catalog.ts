export type GameDefinition = {
  id: string;
  title: string;
  description: string;
  href: string;
  image: string;
  imageCrop?: "left-half";
  /** Display/documentation version. Use a new game ID for incompatible rankings. */
  version: number;
  scoreLabel: string;
  scoreUnit: string;
  scoreScale?: number;
  precision?: number;
  scoreMode?: "cumulative";
};

/** Add a definition here when introducing another game to the team arcade. */
export const GAME_CATALOG: readonly GameDefinition[] = [
  {
    id: "yg-clash-royale-defense",
    title: "YGクラロワ",
    description: "様々なキャラを使って自分のタワーを守ろう。相性で押し寄せる敵を迎撃し、強敵ほど高い撃破ポイントを獲得！",
    href: "/game/yg-clash-royale",
    image: "/nanairo/chiaki.png",
    version: 2,
    scoreLabel: "撃破ポイント",
    scoreUnit: "pt",
  },
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
    id: "kobayashi-marathon",
    title: "小林の走れ！マラソン！",
    description: "小林はずっと走り続ける。のどが渇いたタイミングで給水して、累計の水の量で競おう！",
    href: "/game/kobayashi-marathon",
    image: "/homepage/introduce/4.JPEG",
    version: 1,
    scoreLabel: "累計給水量",
    scoreUnit: "L",
    scoreScale: 1000,
    precision: 3,
    scoreMode: "cumulative",
  },
  {
    id: "oshino-fastball",
    title: "押野の出せ！剛速球！",
    description: "振りかぶって、リリースの一瞬を狙え。200.00 km/hへのシビアな一球勝負。",
    href: "/game/oshino-fastball",
    image: "/game/oshino.PNG",
    imageCrop: "oshino",
    version: 1,
    scoreLabel: "最速球速",
    scoreUnit: "km/h",
    scoreScale: 100,
    precision: 2,
  },
  {
    id: "nagayasu-horse-racing",
    title: "長安の走れ！馬ども！",
    description: "100万円を握りしめ、15頭の大激走へ。8種類の馬券で目指せ1000兆円！",
    href: "/game/nagayasu-horse-racing",
    image: "/game/nagayasu.PNG",
    version: 1,
    scoreLabel: "最高持ち金",
    scoreUnit: "円",
  },
  {
    id: "horie-bench-breaker",
    title: "堀江の引っ張れ！三塁ベンチ破壊！",
    description: "コースは運、タイミングは腕。インコース1球勝負で引っ張り、三塁ベンチに大波乱！",
    href: "/game/horie-bench-breaker",
    image: "/game/horie.PNG",
    version: 1,
    scoreLabel: "総被害額",
    scoreUnit: "円",
  },
  {
    id: "negishi-ramen",
    title: "根岸のすすれ！ラーメン！",
    description: "長押しですすり、緑で息継ぎ！20秒の真剣勝負、根岸ゾーンで限界の替え玉へ。",
    href: "/game/negishi-ramen",
    image: "/game/negishi_susuru.PNG",
    imageCrop: "left-half",
    version: 1,
    scoreLabel: "すすった総重量",
    scoreUnit: "g",
  },
  {
    id: "shibata-dodge",
    title: "芝田の避けろ！死球！！",
    description: "上下にスワイプして死球を回避！回復とハテナに運命を託し、避けた球数で勝負。",
    href: "/game/shibata-dodge",
    image: "/game/shibata_yokeru.PNG",
    version: 1,
    scoreLabel: "避けたボール",
    scoreUnit: "球",
  },
  {
    id: "goto-nanairo",
    title: "後藤の投げろ！七色のシンカー！",
    description: "フルカウントから5打者勝負！七色の軌道とリリースで三振を奪え。魔球も失投も運しだい。",
    href: "/game/goto-nanairo",
    image: "/nanairo/top.png",
    version: 1,
    scoreLabel: "合計ポイント",
    scoreUnit: "pt",
  },
];

export function getGame(id: string): GameDefinition | undefined {
  return GAME_CATALOG.find((game) => game.id === id);
}
