export type AccountingEntry = { id: string; date: string; category: string; income: number; expense: number; createdBy: string; createdAt: number };
export type MembershipPayment = { year: number; playerId: string; paid: boolean; paidAt: number | null };
export type AccountingData = { entries: AccountingEntry[]; payments: MembershipPayment[]; players: { id: string; name: string }[] };

export function validateAccountingData(value: unknown): AccountingData {
  if (!value || typeof value !== "object") throw new Error("Invalid accounting data");
  const input = value as Partial<AccountingData>;
  if (!Array.isArray(input.entries) || !Array.isArray(input.payments)) throw new Error("Invalid accounting data");
  const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 100 && id.trim() === id;
  const validAmount = (amount: unknown): amount is number => Number.isSafeInteger(amount) && (amount as number) >= 0;
  const entries = input.entries.map((entry) => {
    if (!entry || !validId(entry.id) || typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || entry.date.startsWith("0000-")
      || typeof entry.category !== "string" || !entry.category.trim() || entry.category.trim().length > 100
      || !validAmount(entry.income) || !validAmount(entry.expense) || (entry.income === 0 && entry.expense === 0)) throw new Error("Invalid accounting entry");
    const date = new Date(`${entry.date}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date) throw new Error("Invalid date");
    return { id: entry.id, date: entry.date, category: entry.category.trim(), income: entry.income, expense: entry.expense, createdBy: "", createdAt: 0 };
  });
  const payments = input.payments.map((payment) => {
    if (!payment || !Number.isInteger(payment.year) || payment.year < 1900 || payment.year > 9999 || !validId(payment.playerId) || typeof payment.paid !== "boolean") throw new Error("Invalid membership payment");
    return { year: payment.year, playerId: payment.playerId, paid: payment.paid, paidAt: null };
  });
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length || new Set(payments.map((payment) => `${payment.year}:${payment.playerId}`)).size !== payments.length) throw new Error("Duplicate accounting entry");
  return { entries, payments, players: [] };
}

export function accountingBalance(entries: AccountingEntry[]): bigint {
  return entries.reduce((total, entry) => total + BigInt(entry.income) - BigInt(entry.expense), BigInt(0));
}