import axios from "axios";

export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error?.message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

interface ZodIssueLike {
  path?: (string | number)[];
  message?: string;
}

export function getCsvImportErrorMessage(
  error: unknown,
  fallback = "Could not import the CSV",
): string {
  if (axios.isAxiosError(error)) {
    const details = error.response?.data?.error?.details;
    if (Array.isArray(details) && details.length > 0) {
      return details
        .map((issue: ZodIssueLike) => {
          const path = issue.path ?? [];
          const rowIndex = typeof path[1] === "number" ? path[1] : undefined;
          const field = typeof path[2] === "string" ? path[2] : undefined;
          const prefix =
            rowIndex !== undefined ? `Row ${rowIndex + 1}${field ? ` (${field})` : ""}` : null;
          return prefix ? `${prefix}: ${issue.message}` : issue.message;
        })
        .join("; ");
    }
  }
  return getErrorMessage(error, fallback);
}
