import { stringify } from "csv-stringify/sync";

interface ExportableLineItem {
  date: Date;
  category: string;
  customCategory: string | null;
  amount: unknown;
  description: string;
}

interface ExportableClaim {
  id: string;
  totalAmount: unknown;
  updatedAt: Date;
  claimant: { firstName: string; lastName: string; email: string };
  lineItems: ExportableLineItem[];
}

const COLUMNS = [
  "claimId",
  "claimantName",
  "claimantEmail",
  "approvedAt",
  "claimTotal",
  "lineItemDate",
  "category",
  "amount",
  "description",
] as const;

// One row per line item, not per claim — bookkeeping needs the itemised breakdown, and the
// claim-level fields (id, claimant, total, approval date) just repeat across a claim's rows.
export function buildApprovedClaimsCsv(claims: ExportableClaim[]): string {
  const rows = claims.flatMap((claim) =>
    claim.lineItems.map((item) => ({
      claimId: claim.id,
      claimantName: `${claim.claimant.firstName} ${claim.claimant.lastName}`,
      claimantEmail: claim.claimant.email,
      approvedAt: claim.updatedAt.toISOString(),
      claimTotal: String(claim.totalAmount),
      lineItemDate: item.date.toISOString().slice(0, 10),
      category:
        item.category === "OTHER" && item.customCategory ? item.customCategory : item.category,
      amount: String(item.amount),
      description: item.description,
    })),
  );

  return stringify(rows, { header: true, columns: COLUMNS });
}
