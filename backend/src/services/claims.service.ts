import { NotFoundError } from "../errors";
import { prisma } from "../lib/prisma";

export interface CreateLineItemInput {
  date: Date;
  category: string;
  amount: number;
  description: string;
}

export async function createClaim(claimantId: string, lineItems: CreateLineItemInput[]) {
  const created = await prisma.claim.create({
    data: {
      claimantId,
      status: "PENDING",
      lineItems: { create: lineItems },
    },
  });

  // The claims-before-write trigger computes total_amount at INSERT time (before any
  // line items exist), and the line_items trigger updates it afterwards in separate
  // statements — so the row returned by create() above has a stale total. Re-fetch.
  return getClaimForClaimant(created.id, claimantId);
}

export async function listClaimsForClaimant(claimantId: string) {
  return prisma.claim.findMany({
    where: { claimantId },
    include: { lineItems: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getClaimForClaimant(claimId: string, claimantId: string) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, claimantId },
    include: { lineItems: true },
  });

  if (!claim) {
    throw new NotFoundError("Claim not found");
  }

  return claim;
}
