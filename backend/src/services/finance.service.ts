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
  events: { orderBy: { createdAt: "asc" } },
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

  // Once a claim is APPROVED it's permanently immutable (the claims_before_write trigger
  // rejects any further UPDATE — see migration 20260921080405), so `updatedAt` on an
  // APPROVED row is exactly the moment it finished approving and can never drift after. No
  // separate "approvedAt" column is needed to filter "approved within this period". Other
  // statuses have no equivalent fixed instant (a PENDING or REJECTED claim can still be
  // edited), so those fall back to filtering by when the claim was submitted.
  if (status === "APPROVED") {
    return prisma.claim.findMany({
      where: { status: "APPROVED", updatedAt: { gte: from, lte: to } },
      include: FINANCE_CLAIM_INCLUDE,
      orderBy: { updatedAt: "asc" },
    });
  }

  return prisma.claim.findMany({
    where: { status, createdAt: { gte: from, lte: to } },
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
