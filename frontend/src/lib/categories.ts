export const EXPENSE_CATEGORIES = [
  "TRAVEL",
  "MEALS",
  "ACCOMMODATION",
  "SUPPLIES",
  "SOFTWARE",
  "OTHER",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  TRAVEL: "Travel",
  MEALS: "Meals",
  ACCOMMODATION: "Accommodation",
  SUPPLIES: "Supplies",
  SOFTWARE: "Software",
  OTHER: "Other",
};
