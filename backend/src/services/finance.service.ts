import type { ClaimStatus } from "../../generated/prisma/client";
import { Prisma } from "../../generated/prisma/client";
import { ValidationError } from "../errors";
import { buildPaginationMeta, resolvePagination, type PaginationInput } from "../lib/pagination";
import { prisma } from "../lib/prisma";

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

  return prisma.claim.findMany({
    where: {
      status,
      lineItems: { some: { date: { gte: from, lte: to } } },
    },
    include: FINANCE_CLAIM_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}
