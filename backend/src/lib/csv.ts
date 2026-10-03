import { parse } from "csv-parse/sync";
import { ValidationError } from "../errors";

export interface RawLineItemRow {
  date?: string;
  category?: string;
  customCategory?: string;
  amount?: string;
  description?: string;
  receipt?: string;
}

const REQUIRED_COLUMNS = ["date", "category", "amount", "description"];

export function parseLineItemsCsv(buffer: Buffer): RawLineItemRow[] {
  let rows: Record<string, string>[];

  try {
    rows = parse(buffer, {
      columns: (header: string[]) => header.map((column) => column.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new ValidationError(
      "Could not parse the CSV file. Check that it's a valid CSV with a header row.",
    );
  }

  if (rows.length > 0) {
    const columns = Object.keys(rows[0]);
    const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
    if (missing.length > 0) {
      throw new ValidationError(
        `CSV is missing required column(s): ${missing.join(", ")}. Expected columns: ${[...REQUIRED_COLUMNS, "customCategory (optional)", "receipt (optional)"].join(", ")}.`,
      );
    }
  }

  return rows.map((row) => ({
    date: row.date,
    category: row.category?.toUpperCase(),
    customCategory: row.customcategory,
    amount: row.amount,
    description: row.description,
    receipt: row.receipt?.trim() || undefined,
  }));
}
