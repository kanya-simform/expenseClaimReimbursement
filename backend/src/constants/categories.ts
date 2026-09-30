export const EXPENSE_CATEGORIES = [
  "TRAVEL",
  "MEALS",
  "ACCOMMODATION",
  "SUPPLIES",
  "SOFTWARE",
  "OTHER",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
