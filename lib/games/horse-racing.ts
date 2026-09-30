export const INITIAL_BALANCE = 1_000_000;
export const MAX_BALANCE = 1_000_000_000_000_000;
export const BET_TYPES = [
  { id: "win", label: "単勝", count: 1, ordered: false, frames: false, description: "選んだ馬が1着で的中。" },
  { id: "place", label: "複勝", count: 1, ordered: false, frames: false, description: "選んだ馬が3着以内で的中。" },
  { id: "bracket", label: "枠連", count: 2, ordered: false, frames: true, description: "選んだ2枠が1・2着で的中（順不同）。" },
  { id: "quinella", label: "馬連", count: 2, ordered: false, frames: false, description: "選んだ2頭が1・2着で的中（順不同）。" },
  { id: "exacta", label: "馬単", count: 2, ordered: true, frames: false, description: "選んだ2頭が1・2着で的中（着順通り）。" },
  { id: "wide", label: "ワイド", count: 2, ordered: false, frames: false, description: "選んだ2頭が両方3着以内で的中。" },
  { id: "trio", label: "3連複", count: 3, ordered: false, frames: false, description: "選んだ3頭が1〜3着で的中（順不同）。" },
  { id: "trifecta", label: "3連単", count: 3, ordered: true, frames: false, description: "選んだ3頭が1〜3着で的中（着順通り）。" },
] as const;
export type BetTypeId = typeof BET_TYPES[number]["id"];
export type BetType = BetTypeId;
export type Horse = { number: number; name: string; frame: number; ability: number; winOddsTenths: number };
export type Ticket = { id: string; type: BetTypeId; selection: number[]; amount: number; oddsTenths: number };
export type HorseRaceState = { kind: "horse-racing"; race: number; phase: "betting" | "result"; horses: Horse[]; tickets: Ticket[]; order: number[]; payout: number; balanceBefore: number };
const names = ["ナガヤスダッシュ", "カワタカサイコロ", "オシノロケット", "アズミノキセキ", "トダノイチゲキ", "ホリエノツバサ", "ネギシノイジ", "イケハラスマイル", "ゴトウノコトバ", "ダイヤモンドラン", "ベンチノヒーロー", "サヨナラアーチ", "マッハノウマドモ", "ブカツガエリ", "オオアナファイヤー"];
const cap = (value: bigint) => Number(value > BigInt(MAX_BALANCE) ? BigInt(MAX_BALANCE) : value);
function checkBalance(balance: number) {
  if (!Number.isSafeInteger(balance) || balance < 0 || balance > MAX_BALANCE) throw new Error("所持金が不正です。");
}
function draw(random: () => number) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("抽選値が不正です。");
  return value;
}
function selectionValid(horses: Horse[], type: BetTypeId, selection: number[]) {
  const definition = BET_TYPES.find((bet) => bet.id === type);
  if (!definition || selection.length !== definition.count || !Array.from(selection).every((number) => Number.isInteger(number) && number >= 1 && number <= (definition.frames ? 8 : 15))) return false;
  if (!definition.frames) return new Set(selection).size === selection.length;
  return selection[0] !== selection[1] || horses.filter((horse) => horse.frame === selection[0]).length >= 2;
}
function matches(type: BetTypeId, selection: number[], top: number[], frames: Map<number, number>) {
  if (type === "win") return top[0] === selection[0];
  if (type === "place") return top.slice(0, 3).includes(selection[0]);
  if (type === "exacta" || type === "trifecta") return selection.every((number, index) => number === top[index]);
  if (type === "bracket") {
    const first = frames.get(top[0]), second = frames.get(top[1]);
    return (first === selection[0] && second === selection[1]) || (first === selection[1] && second === selection[0]);
  }
  return selection.every((number) => top.slice(0, type === "quinella" ? 2 : 3).includes(number));
}
export function ticketWins(ticket: Pick<Ticket, "type" | "selection">, order: number[], horses: Horse[]) {
  return matches(ticket.type, ticket.selection, order, new Map(horses.map((horse) => [horse.number, horse.frame])));
}
export function quoteOdds(horses: Horse[], type: BetTypeId, selection: number[]): number {
  if (!selectionValid(horses, type, selection)) throw new Error("馬・枠の組み合わせを確認してください。");
  const total = horses.reduce((sum, horse) => sum + horse.ability, 0);
  const frames = new Map(horses.map((horse) => [horse.number, horse.frame]));
  let probability = 0;
  // Enumerating the 2,730 possible podiums gives exact Plackett–Luce event probabilities.
  for (const first of horses) for (const second of horses) {
    if (first === second) continue;
    for (const third of horses) {
      if (third === first || third === second) continue;
      if (matches(type, selection, [first.number, second.number, third.number], frames)) {
        probability += first.ability / total * second.ability / (total - first.ability) * third.ability / (total - first.ability - second.ability);
      }
    }
  }
  return Math.max(10, Math.floor(8 / probability + 1e-8));
}
export function createRace(race: number, random: () => number = Math.random): HorseRaceState {
  const horses = names.map((name, index) => ({ number: index + 1, name, frame: Math.floor((index + 3) / 2), ability: 5 + Math.floor(draw(random) ** 2 * 96), winOddsTenths: 0 }));
  const total = horses.reduce((sum, horse) => sum + horse.ability, 0);
  horses.forEach((horse) => { horse.winOddsTenths = Math.max(10, Math.floor(8 * total / horse.ability + 1e-8)); });
  return { kind: "horse-racing", race, phase: "betting", horses, tickets: [], order: [], payout: 0, balanceBefore: 0 };
}
export function purchaseTicket(state: HorseRaceState, balance: number, input: Pick<Ticket, "type" | "selection" | "amount">, id: string) {
  checkBalance(balance);
  if (state.phase !== "betting") throw new Error("このレースの購入受付は終了しました。");
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > balance) throw new Error("所持金以内の1円以上の整数を入力してください。");
  if (state.tickets.some((ticket) => ticket.id === id)) throw new Error("この馬券は購入済みです。");
  const oddsTenths = quoteOdds(state.horses, input.type, input.selection);
  const ticket: Ticket = { id, ...input, selection: [...input.selection], oddsTenths };
  return { state: { ...state, tickets: [...state.tickets, ticket] }, balance: balance - input.amount };
}
function rawPayout(ticket: Ticket) { return BigInt(ticket.amount) * BigInt(ticket.oddsTenths) / BigInt(10); }
export function ticketPayout(ticket: Ticket) { return cap(rawPayout(ticket)); }
export function resolveRace(state: HorseRaceState, balance: number, random: () => number = Math.random) {
  checkBalance(balance);
  if (state.phase !== "betting" || !state.tickets.length) throw new Error("馬券を購入してからレースを開始してください。");
  const remaining = [...state.horses];
  const order: number[] = [];
  while (remaining.length) {
    let value = draw(random) * remaining.reduce((sum, horse) => sum + horse.ability, 0);
    let index = 0;
    while (index < remaining.length - 1 && value >= remaining[index].ability) value -= remaining[index++].ability;
    order.push(remaining.splice(index, 1)[0].number);
  }
  const payout = state.tickets.reduce((sum, ticket) => sum + (ticketWins(ticket, order, state.horses) ? rawPayout(ticket) : BigInt(0)), BigInt(0));
  return { state: { ...state, phase: "result" as const, order, payout: cap(payout), balanceBefore: balance }, balance: cap(BigInt(balance) + payout) };
}
export function formatYen(value: number) {
  let remaining = BigInt(value);
  let result = "";
  for (const [size, unit] of [[1_000_000_000_000, "兆"], [100_000_000, "億"], [10_000, "万"]] as const) {
    const count = remaining / BigInt(size);
    if (count) result += `${count}${unit}`;
    remaining %= BigInt(size);
  }
  return `${result}${remaining || !result ? remaining.toString() : ""}円`;
}
