import { stringify } from "csv-stringify/sync";
import type { Prisma } from "../../generated/prisma/client";
import { formatInTimeZone } from "./timezone";

interface ExportableLineItem {
  date: Date;
  category: string;
  customCategory: string | null;
  amount: Prisma.Decimal;
  description: string;
}

interface ExportableClaim {
  id: string;
  status: string;
  totalAmount: Prisma.Decimal;
  updatedAt: Date;
  claimant: { firstName: string; lastName: string; email: string };
  lineItems: ExportableLineItem[];
}

const COLUMNS = [
  "claimId",
  "status",
  "claimantName",
  "claimantEmail",
  "lastUpdatedAt",
  "claimTotal",
  "lineItemDate",
  "category",
  "amount",
  "description",
] as const;

// One row per line item, not per claim — bookkeeping needs the itemised breakdown, and the
// claim-level fields (id, claimant, total, status) just repeat across a claim's rows.
export function buildClaimsExportCsv(claims: ExportableClaim[], timeZone: string): string {
  const rows = claims.flatMap((claim) =>
    claim.lineItems.map((item) => ({
      claimId: claim.id,
      status: claim.status,
      claimantName: `${claim.claimant.firstName} ${claim.claimant.lastName}`,
      claimantEmail: claim.claimant.email,
      lastUpdatedAt: formatInTimeZone(claim.updatedAt, timeZone),
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
