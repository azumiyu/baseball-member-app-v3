/** Original YG characters. Portraits reuse photos already supplied to this app. */
export type RoyaleTrait = "none" | "charge" | "slow" | "shield" | "death-burst" | "dodge" | "slam";
export type RoyaleCard = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  role: string;
  badge: string;
  color: string;
  image: string;
  objectPosition?: string;
  imageScale?: number;
  cost: number;
  hp: number;
  damage: number;
  speed: number;
  range: number;
  attackTicks: number;
  count: number;
  radius: number;
  air: boolean;
  targets: "ground" | "both";
  /** Awarded per enemy unit defeated, including each member of a squad. */
  killPoints: number;
  splash: number;
  trait: RoyaleTrait;
};

const base = { count: 1, radius: 18, air: false, targets: "ground" as const, splash: 0, trait: "none" as const };

export const ROYALE_CARDS: readonly RoyaleCard[] = [
  { ...base, id: "mega-chiaki", killPoints: 350, name: "メガ千明", shortName: "千明", description: "着地で周囲を吹き飛ばす重量級。地上の群れをまとめて迎撃。空中には攻撃できない。", role: "重量・範囲", badge: "着地衝撃", color: "#b78aff", image: "/nanairo/chiaki.png", cost: 7, hp: 1950, damage: 190, speed: 39, range: 29, attackTicks: 25, radius: 25, splash: 60, trait: "slam" },
  { ...base, id: "ramen-negishi", killPoints: 210, name: "ラーメン根岸プリンス", shortName: "根岸", description: "走り続けるとチャージ！最初の一撃が2倍。単体への火力は高いが群れに弱い。", role: "突撃・単体", badge: "突撃 ×2", color: "#ffb65f", image: "/game/negishi_susuru.PNG", objectPosition: "left center", imageScale: 2, cost: 5, hp: 1100, damage: 225, speed: 67, range: 27, attackTicks: 25, radius: 21, trait: "charge" },
  { ...base, id: "kawataka-squad", killPoints: 35, name: "カワタカ部隊", shortName: "川高", description: "4人で取り囲む低コスト部隊。単体の強敵に強く、範囲攻撃にはご用心。", role: "群れ・4人", badge: "4人出撃", color: "#72d5a9", image: "/game/kawataka.PNG", cost: 3, hp: 180, damage: 43, speed: 64, range: 22, attackTicks: 16, count: 4, radius: 12 },
  { ...base, id: "goto-sinker", killPoints: 150, name: "ゴトウシンカー", shortName: "後藤", description: "七色のシンカーが地上と空中に命中。小範囲の敵を減速させて時間をつくる。", role: "遠距離・減速", badge: "減速", color: "#70dfdb", image: "/nanairo/goto.jpeg", cost: 4, hp: 470, damage: 83, speed: 48, range: 145, attackTicks: 25, targets: "both", splash: 30, trait: "slow" },
  { ...base, id: "kitazawa-archer", killPoints: 120, name: "北澤クロスファイヤー", shortName: "北澤", description: "長い射程で空中の敵も狙い撃ち。前に盾役を置くと頼れる援護役。", role: "遠距離・対空", badge: "対空", color: "#f2b5ff", image: "/nanairo/kitazawa.png", cost: 3, hp: 370, damage: 100, speed: 51, range: 175, attackTicks: 23, targets: "both" },
  { ...base, id: "ikehara-giant", killPoints: 280, name: "池原神パンツジャイアント", shortName: "池原", description: "高い体力で敵の攻撃を受け止める前衛。後ろの遠距離役を守りながら地上の敵を迎撃。", role: "タンク・前衛", badge: "地上迎撃", color: "#f6ce70", image: "/nanairo/ikehara.png", cost: 5, hp: 2450, damage: 160, speed: 34, range: 38, attackTicks: 29, radius: 25, targets: "ground" },
  { ...base, id: "yamaki-bomber", killPoints: 130, name: "八巻社長激務", shortName: "八巻", description: "広い爆風で地上の部隊を一掃。空中の敵は味方の対空役に任せよう。", role: "地上・範囲", badge: "広範囲", color: "#ff966e", image: "/nanairo/yamaki.png", cost: 3, hp: 400, damage: 135, speed: 47, range: 130, attackTicks: 30, splash: 76 },
  { ...base, id: "kawanabe-knight", killPoints: 140, name: "川鍋タイワン", shortName: "川鍋", description: "体力と攻撃のバランスがいい前衛。敵を引き寄せてタワーと一緒に倒そう。", role: "前衛・万能", badge: "安定前衛", color: "#84b9ff", image: "/nanairo/kawanabe.png", cost: 3, hp: 930, damage: 112, speed: 57, range: 25, attackTicks: 21 },
  { ...base, id: "misawa-dragon", killPoints: 190, name: "三澤ローボールドラゴン", shortName: "三澤", description: "川を飛び越え、空から範囲攻撃。地上専用の敵を安全に処理できる。", role: "飛行・範囲", badge: "飛行 / 対空", color: "#92e590", image: "/nanairo/misawa.png", cost: 4, hp: 690, damage: 90, speed: 57, range: 118, attackTicks: 25, air: true, targets: "both", splash: 53 },
  { ...base, id: "kan-bats", killPoints: 22, name: "菅こうもり隊", shortName: "菅", description: "すばやい空中3人組。対空を持たない敵に強いが、範囲攻撃でまとめて落ちる。", role: "飛行・3人", badge: "飛行 ×3", color: "#c69cff", image: "/nanairo/kan.png", cost: 2, hp: 105, damage: 36, speed: 95, range: 22, attackTicks: 16, count: 3, radius: 11, air: true, targets: "both" },
  { ...base, id: "kobayashi-runner", killPoints: 135, name: "小林マラソンライダー", shortName: "小林", description: "驚きの速さで地上の敵へ駆けつける遊撃役。後衛への奇襲や抜けてきた敵の迎撃に。", role: "速攻・遊撃", badge: "地上迎撃", color: "#85e7df", image: "/nanairo/kobayashi.png", cost: 3, hp: 520, damage: 115, speed: 105, range: 30, attackTicks: 22, targets: "ground" },
  { ...base, id: "ishihata-spirits", killPoints: 12, name: "石畑スピリット", shortName: "石畑", description: "1コストで3人出撃。小さなシンカーで敵を減速し、手札の回転も助ける。", role: "軽量・減速", badge: "1コスト ×3", color: "#b4f2ff", image: "/nanairo/ishihata.png", cost: 1, hp: 72, damage: 25, speed: 86, range: 80, attackTicks: 23, count: 3, radius: 10, targets: "both", trait: "slow" },
  { ...base, id: "abe-guardian", killPoints: 100, name: "阿部シールドガード", shortName: "阿部", description: "一度きりのシールドで攻撃を受け止める。高火力の敵への時間稼ぎに。", role: "防衛・シールド", badge: "盾 +320", color: "#a8b8d9", image: "/nanairo/abe.png", cost: 2, hp: 500, damage: 59, speed: 55, range: 24, attackTicks: 21, trait: "shield" },
  { ...base, id: "oshino-wizard", killPoints: 230, name: "押野先生シラフ", shortName: "押野", description: "地上も空中も焼き払う大きな範囲攻撃。群れへの切り札だが接近戦に注意。", role: "遠距離・範囲", badge: "範囲 / 対空", color: "#ff8bad", image: "/game/oshino.PNG", cost: 5, hp: 610, damage: 150, speed: 47, range: 143, attackTicks: 28, targets: "both", splash: 73 },
  { ...base, id: "nagayasu-sniper", killPoints: 200, name: "長安ロングレンジャー", shortName: "長安", description: "最長射程の重い一発。タンクの後ろから狙撃しよう。攻撃間隔は長め。", role: "長射程・単体", badge: "射程 205", color: "#a7ceff", image: "/game/nagayasu.PNG", cost: 4, hp: 390, damage: 260, speed: 43, range: 205, attackTicks: 39, targets: "both" },
  { ...base, id: "horie-golem", killPoints: 350, name: "堀江ベンチゴーレム", shortName: "堀江", description: "前線を支える巨大な壁。地上の敵を殴り、倒されても周囲に爆発ダメージを残す。", role: "重量・前衛", badge: "撃破時爆発", color: "#d4b17e", image: "/game/horie.PNG", cost: 6, hp: 2900, damage: 175, speed: 31, range: 38, attackTicks: 29, radius: 26, targets: "ground", splash: 30, trait: "death-burst" },
  { ...base, id: "shibata-dodger", killPoints: 90, name: "芝田バスターエンドラン", shortName: "芝田", description: "3回に1回、敵ユニットの攻撃をするりと回避。すばやく前に出る器用な遊撃手。", role: "機動・回避", badge: "3撃目を回避", color: "#ffdb73", image: "/game/shibata_yokeru.PNG", cost: 2, hp: 350, damage: 65, speed: 85, range: 75, attackTicks: 19, targets: "both", trait: "dodge" },
];

const CARD_BY_ID = new Map(ROYALE_CARDS.map((card) => [card.id, card]));
export function royaleCard(id: string): RoyaleCard {
  const card = CARD_BY_ID.get(id);
  if (!card) throw new Error("キャラクターを確認してください。");
  return card;
}

/** Fixed base bounty; stronger opponents are worth more, swarms pay per member. */
export function royaleKillPoints(card: RoyaleCard | string): number {
  return (typeof card === "string" ? royaleCard(card) : card).killPoints;
}

export const ROYALE_DEFAULT_DECK: readonly string[] = [
  "mega-chiaki", "ramen-negishi", "kawataka-squad", "goto-sinker",
  "kitazawa-archer", "ikehara-giant", "misawa-dragon", "kan-bats",
];
