/** All amounts are integer yen. BigInt is used only during payout arithmetic. */
export const INITIAL_BALANCE = 1_000_000;
export const MAX_BALANCE = 1_000_000_000_000_000;
const MAX_MONEY = BigInt(MAX_BALANCE);

export const BET_TYPES = [
  { id: "win", label: "単勝", count: 1, ordered: false, frames: false, description: "選んだ馬が1着" },
  { id: "place", label: "複勝", count: 1, ordered: false, frames: false, description: "選んだ馬が3着以内" },
  { id: "bracket", label: "枠連", count: 2, ordered: false, frames: true, description: "選んだ2枠が1・2着（順不同）" },
  { id: "quinella", label: "馬連", count: 2, ordered: false, frames: false, description: "選んだ2頭が1・2着（順不同）" },
  { id: "exacta", label: "馬単", count: 2, ordered: true, frames: false, description: "選んだ2頭が1・2着（着順通り）" },
  { id: "wide", label: "ワイド", count: 2, ordered: false, frames: false, description: "選んだ2頭が両方3着以内" },
  { id: "trio", label: "3連複", count: 3, ordered: false, frames: false, description: "選んだ3頭が1〜3着（順不同）" },
  { id: "trifecta", label: "3連単", count: 3, ordered: true, frames: false, description: "選んだ3頭が1〜3着（着順通り）" },
] as const;

export type BetTypeId = (typeof BET_TYPES)[number]["id"];
export type Horse = { number: number; name: string; frame: number; ability: number; winOddsTenths: number };
export type Ticket = { id: string; type: BetTypeId; selection: number[]; amount: number; oddsTenths: number };
export type HorseRaceState = {
  kind: "horse-racing";
  race: number;
  phase: "betting" | "result";
  horses: Horse[];
  tickets: Ticket[];
  order: number[];
  payout: number;
  /** The balance after purchasing tickets and immediately before settlement. */
  balanceBefore: number;
};

const HORSE_NAMES = [
  "ナガヤスウマノオウサマ",
  "オシノチタンゴウキン",
  "カワタカノキセキ",
  "カワナベノサヨナラ",
  "イケハラノタタキ",
  "シバタオニギリターボ",
  "チアキカイリキー",
  "アズミイチワリニキ",
  "ミサワローボールスクイ",
  "カンチホウトビスギワロタ",
  "ヤマキシャチョウ",
  "コバヤシマラソン",
  "ネギシティゴラシンジャ",
  "トダゼンリョクガチパンツ",
  "ホリエオチツイテクダサイ",
];

function randomValue(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("乱数は0以上1未満で指定してください。");
  return value;
}

function validMoney(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_BALANCE;
}

function cappedMoney(value: bigint): number {
  return Number(value > MAX_MONEY ? MAX_MONEY : value);
}

function oddsFromProbability(probability: number): number {
  // Ten integer ticks equal 1.0x. The small epsilon stabilizes exact decimal boundaries.
  return Math.max(10, Math.floor(8 / probability + 1e-9));
}

function selectionInfo(horses: Horse[], type: BetTypeId, selection: number[]) {
  const info = BET_TYPES.find((entry) => entry.id === type);
  if (!info || selection.length !== info.count || selection.some((number) => !Number.isInteger(number))) {
    throw new Error("馬券の種類と選択数を確認してください。");
  }
  if (info.frames) {
    if (selection.some((frame) => !horses.some((horse) => horse.frame === frame))) throw new Error("出走している枠を選んでください。");
    if (selection[0] === selection[1] && horses.filter((horse) => horse.frame === selection[0]).length < 2) {
      throw new Error("同じ枠は2頭以上の馬がいる場合に選べます。");
    }
  } else if (new Set(selection).size !== selection.length || selection.some((number) => !horses.some((horse) => horse.number === number))) {
    throw new Error("異なる出走馬を選んでください。");
  }
  return info;
}

function matches(type: BetTypeId, selection: number[], first: Horse, second: Horse, third: Horse): boolean {
  switch (type) {
    case "win": return selection[0] === first.number;
    case "place": return selection[0] === first.number || selection[0] === second.number || selection[0] === third.number;
    case "bracket": return (selection[0] === first.frame && selection[1] === second.frame) || (selection[1] === first.frame && selection[0] === second.frame);
    case "quinella": return selection.includes(first.number) && selection.includes(second.number);
    case "exacta": return selection[0] === first.number && selection[1] === second.number;
    case "wide": return selection.every((number) => number === first.number || number === second.number || number === third.number);
    case "trio": return selection.includes(first.number) && selection.includes(second.number) && selection.includes(third.number);
    case "trifecta": return selection[0] === first.number && selection[1] === second.number && selection[2] === third.number;
  }
}

/** Exact top-three event probability under the same weighted draws as the race. */
export function quoteOdds(horses: Horse[], type: BetTypeId, selection: number[]): number {
  selectionInfo(horses, type, selection);
  const total = horses.reduce((sum, horse) => sum + horse.ability, 0);
  if (horses.length !== 15 || horses.some((horse) => !Number.isFinite(horse.ability) || horse.ability <= 0)) {
    throw new Error("15頭の能力値を確認してください。");
  }
  if (type === "win") return oddsFromProbability(horses.find((horse) => horse.number === selection[0])!.ability / total);
  let probability = 0;
  for (const first of horses) {
    for (const second of horses) {
      if (first.number === second.number) continue;
      const pairProbability = first.ability / total * second.ability / (total - first.ability);
      for (const third of horses) {
        if (third.number === first.number || third.number === second.number) continue;
        if (matches(type, selection, first, second, third)) {
          probability += pairProbability * third.ability / (total - first.ability - second.ability);
        }
      }
    }
  }
  if (!Number.isFinite(probability) || probability <= 0) throw new Error("この組み合わせでは馬券を購入できません。");
  return oddsFromProbability(probability);
}

export function createRace(race: number, random: () => number = Math.random): HorseRaceState {
  if (!Number.isSafeInteger(race) || race < 1) throw new Error("レース番号を確認してください。");
  const names = [...HORSE_NAMES];
  for (let index = names.length - 1; index > 0; index--) {
    const swap = Math.floor(randomValue(random) * (index + 1));
    [names[index], names[swap]] = [names[swap], names[index]];
  }
  const horses = names.map((name, index): Horse => ({
    number: index + 1,
    name,
    frame: Math.floor((index + 3) / 2),
    ability: 10 + Math.floor(Math.pow(randomValue(random), 2) * 191),
    winOddsTenths: 10,
  }));
  const total = horses.reduce((sum, horse) => sum + horse.ability, 0);
  for (const horse of horses) horse.winOddsTenths = oddsFromProbability(horse.ability / total);
  return { kind: "horse-racing", race, phase: "betting", horses, tickets: [], order: [], payout: 0, balanceBefore: 0 };
}

export function purchaseTicket(
  state: HorseRaceState,
  balance: number,
  input: { type: BetTypeId; selection: number[]; amount: number },
  ticketId: string,
): { state: HorseRaceState; balance: number } {
  if (state.phase !== "betting") throw new Error("このレースの馬券販売は終了しました。");
  if (!validMoney(balance) || !validMoney(input.amount) || input.amount < 1) throw new Error("購入金額は1円以上の整数で入力してください。");
  if (input.amount > balance) throw new Error("所持金が足りません。");
  if (!ticketId || state.tickets.some((ticket) => ticket.id === ticketId)) throw new Error("この馬券は購入済みです。");
  const info = selectionInfo(state.horses, input.type, input.selection);
  const selection = [...input.selection];
  if (!info.ordered) selection.sort((first, second) => first - second);
  const ticket: Ticket = { id: ticketId, type: input.type, selection, amount: input.amount, oddsTenths: quoteOdds(state.horses, input.type, selection) };
  return { state: { ...state, tickets: [...state.tickets, ticket] }, balance: balance - input.amount };
}

export function ticketWins(ticket: Ticket, order: number[], horses: Horse[]): boolean {
  const podium = order.slice(0, 3).map((number) => horses.find((horse) => horse.number === number));
  if (podium.length !== 3 || podium.some((horse) => !horse) || new Set(order.slice(0, 3)).size !== 3) return false;
  return matches(ticket.type, ticket.selection, podium[0]!, podium[1]!, podium[2]!);
}

function rawPayout(ticket: Ticket): bigint {
  if (!validMoney(ticket.amount) || ticket.amount < 1 || !Number.isSafeInteger(ticket.oddsTenths) || ticket.oddsTenths < 10) {
    throw new Error("馬券の金額またはオッズが不正です。");
  }
  return BigInt(ticket.amount) * BigInt(ticket.oddsTenths) / BigInt(10);
}

/** Returns floor(stake × purchased odds), capped to the wallet's maximum. */
export function ticketPayout(ticket: Ticket): number {
  return cappedMoney(rawPayout(ticket));
}

export function resolveRace(
  state: HorseRaceState,
  balance: number,
  random: () => number = Math.random,
): { state: HorseRaceState; balance: number } {
  if (state.phase !== "betting") throw new Error("このレースは精算済みです。");
  if (state.tickets.length === 0) throw new Error("馬券を購入してからレースを始めてください。");
  if (!validMoney(balance)) throw new Error("所持金が不正です。");
  const remaining = [...state.horses];
  const order: number[] = [];
  while (remaining.length) {
    let target = randomValue(random) * remaining.reduce((sum, horse) => sum + horse.ability, 0);
    let index = 0;
    for (; index < remaining.length - 1; index++) {
      target -= remaining[index].ability;
      if (target < 0) break;
    }
    order.push(remaining.splice(index, 1)[0].number);
  }
  const totalPayout = state.tickets.reduce((sum, ticket) => sum + (ticketWins(ticket, order, state.horses) ? rawPayout(ticket) : BigInt(0)), BigInt(0));
  return {
    state: { ...state, phase: "result", order, payout: cappedMoney(totalPayout), balanceBefore: balance },
    balance: cappedMoney(BigInt(balance) + totalPayout),
  };
}

export function formatYen(value: number): string {
  if (!validMoney(value)) return "0円";
  if (value === 0) return "0円";
  let remaining = value;
  let text = "";
  for (const [unit, label] of [[1_000_000_000_000, "兆"], [100_000_000, "億"], [10_000, "万"], [1, ""]] as const) {
    const amount = Math.floor(remaining / unit);
    if (amount) text += `${amount}${label}`;
    remaining %= unit;
  }
  return `${text}円`;
}

/** Reject incomplete/corrupt localStorage snapshots before allowing play. */
export function isHorseRaceState(value: unknown): value is HorseRaceState {
  if (!value || typeof value !== "object") return false;
  const state = value as HorseRaceState;
  if (state.kind !== "horse-racing" || !Number.isSafeInteger(state.race) || state.race < 1 || !["betting", "result"].includes(state.phase)) return false;
  if (!validMoney(state.payout) || !validMoney(state.balanceBefore) || !Array.isArray(state.horses) || state.horses.length !== 15 || !Array.isArray(state.tickets) || !Array.isArray(state.order)) return false;
  if (state.horses.some((horse, index) => !horse || horse.number !== index + 1 || horse.frame !== Math.floor((index + 3) / 2) || typeof horse.name !== "string" || !horse.name || !Number.isInteger(horse.ability) || horse.ability < 10 || horse.ability > 200 || !Number.isSafeInteger(horse.winOddsTenths) || horse.winOddsTenths < 10)) return false;
  const ids = new Set<string>();
  for (const ticket of state.tickets) {
    if (!ticket || typeof ticket.id !== "string" || !ticket.id || ids.has(ticket.id) || !Array.isArray(ticket.selection) || !validMoney(ticket.amount) || ticket.amount < 1 || !Number.isSafeInteger(ticket.oddsTenths) || ticket.oddsTenths < 10) return false;
    try { selectionInfo(state.horses, ticket.type, ticket.selection); } catch { return false; }
    ids.add(ticket.id);
  }
  if (state.phase === "betting") return state.order.length === 0 && state.payout === 0;
  return state.tickets.length > 0 && state.order.length === 15 && new Set(state.order).size === 15 && state.order.every((number) => Number.isInteger(number) && number >= 1 && number <= 15);
}
