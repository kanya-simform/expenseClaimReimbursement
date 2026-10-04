import type { ClaimStatus } from "../../generated/prisma/client";
import { Prisma } from "../../generated/prisma/client";
import { NotFoundError, ValidationError } from "../errors";
import { buildPaginationMeta, resolvePagination, type PaginationInput } from "../lib/pagination";
import { prisma } from "../lib/prisma";

// Finance is read-only (spec §3.5) — this include carries enough to audit a claim (who
// submitted it, its line items, the approval chain and history) without the per-attachment
// detail the claimant/approver views need, since finance doesn't act on receipts.
const FINANCE_CLAIM_INCLUDE = {
  claimant: { select: { id: true, firstName: true, lastName: true, email: true } },
  lineItems: { orderBy: { id: "asc" } },
  approvalSteps: {
    include: { approver: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { sequence: "asc" },
  },
  events: {
    include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  },
} as const;

export interface ListClaimsFilters extends PaginationInput {
  status?: ClaimStatus;
  from?: Date;
  to?: Date;
}

export async function listAllClaims(filters: ListClaimsFilters = {}) {
  const { page, pageSize, skip, take } = resolvePagination(filters);

  const where: Prisma.ClaimWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      include: FINANCE_CLAIM_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.claim.count({ where }),
  ]);

  return { claims, pagination: buildPaginationMeta(total, page, pageSize) };
}

export async function getClaimsForExport(status: ClaimStatus, from: Date, to: Date) {
  if (from > to) {
    throw new ValidationError("'from' must be on or before 'to'");
  }

  // "Within the period" is keyed off the line item dates the claimant actually entered when
  // creating the claim — not a claim-level system timestamp (createdAt/updatedAt mean
  // different things depending on status) — so the same rule applies regardless of status.
  // A claim qualifies if ANY of its line items falls in range; once it qualifies, every line
  // item is included (not just the in-range ones), so each row's claimTotal still matches the
  // sum of that claim's visible rows.
  return prisma.claim.findMany({
    where: {
      status,
      lineItems: { some: { date: { gte: from, lte: to } } },
    },
    include: FINANCE_CLAIM_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

export async function getClaimForFinance(claimId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: FINANCE_CLAIM_INCLUDE,
  });

  if (!claim) {
    throw new NotFoundError("Claim not found");
  }

  return claim;
}
