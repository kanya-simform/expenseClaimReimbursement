import type { ClaimStatus } from "../../generated/prisma/client";
import { Prisma } from "../../generated/prisma/client";
import { resolveApprovalChain } from "./approval-routing";
import { ConflictError, NotFoundError } from "../errors";
import { buildPaginationMeta, resolvePagination, type PaginationInput } from "../lib/pagination";
import { prisma } from "../lib/prisma";

// Ordering by id (a k-sortable cuid) rather than leaving it to incidental Postgres row
// order — the frontend matches newly staged receipt uploads to newly created line items
// by creation order, which needs to be deterministic.
const CLAIM_INCLUDE = {
  lineItems: { include: { attachments: true }, orderBy: { id: "asc" } },
  approvalSteps: {
    include: { approver: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { sequence: "asc" },
  },
  events: { orderBy: { createdAt: "asc" } },
} as const;

async function routeClaim(tx: Prisma.TransactionClient, claimId: string, claimantId: string) {
  const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId } });
  const approverIds = await resolveApprovalChain(tx, claimantId, claim.totalAmount);

  await tx.approvalStep.deleteMany({ where: { claimId } });
  await tx.approvalStep.createMany({
    data: approverIds.map((approverId, index) => ({
      claimId,
      sequence: index + 1,
      approverId,
    })),
  });
  await tx.claim.update({ where: { id: claimId }, data: { currentStep: 0, status: "PENDING" } });
}

export interface CreateLineItemInput {
  date: Date;
  category: string;
  customCategory: string | null;
  amount: number;
  description: string;
}

export interface UpdateLineItemInput extends CreateLineItemInput {
  id?: string;
}

export async function createClaim(claimantId: string, lineItems: CreateLineItemInput[]) {
  // Routing and the claim insert happen in one transaction: if the claimant's manager chain
  // can't support the computed total (spec §3.2), the whole claim is rolled back rather than
  // left behind with no approvers assigned.
  const claimId = await prisma.$transaction(async (tx) => {
    const created = await tx.claim.create({
      data: {
        claimantId,
        status: "PENDING",
        lineItems: { create: lineItems },
      },
    });

    await routeClaim(tx, created.id, claimantId);

    await tx.claimEvent.create({
      data: { claimId: created.id, type: "SUBMITTED", actorId: claimantId },
    });

    return created.id;
  });

  return getClaimForClaimant(claimId, claimantId);
}

export interface ListClaimsFilters extends PaginationInput {
  status?: ClaimStatus;
  search?: string;
}

export async function listClaimsForClaimant(claimantId: string, filters: ListClaimsFilters = {}) {
  const { page, pageSize, skip, take } = resolvePagination(filters);

  const where: Prisma.ClaimWhereInput = {
    claimantId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          lineItems: {
            some: {
              OR: [
                { description: { contains: filters.search, mode: "insensitive" } },
                { customCategory: { contains: filters.search, mode: "insensitive" } },
              ],
            },
          },
        }
      : {}),
  };

  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      include: CLAIM_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.claim.count({ where }),
  ]);

  return { claims, pagination: buildPaginationMeta(total, page, pageSize) };
}

export async function getClaimForClaimant(claimId: string, claimantId: string) {
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, claimantId },
    include: CLAIM_INCLUDE,
  });

  if (!claim) {
    throw new NotFoundError("Claim not found");
  }

  return claim;
}

export async function updateClaim(
  claimId: string,
  claimantId: string,
  lineItems: UpdateLineItemInput[],
) {
  const existing = await getClaimForClaimant(claimId, claimantId);

  // Belt-and-suspenders: the DB trigger already refuses writes to an approved claim's
  // line items, but checking here first avoids attempting a doomed multi-statement diff
  // and gives the same clear, specific failure a beat earlier.
  if (existing.status === "APPROVED") {
    throw new ConflictError(`Claim ${claimId} is approved and is read-only`);
  }

  const existingIds = new Set(existing.lineItems.map((item) => item.id));

  for (const item of lineItems) {
    if (item.id && !existingIds.has(item.id)) {
      throw new NotFoundError(`Line item ${item.id} not found on this claim`);
    }
  }

  const keptIds = new Set(lineItems.flatMap((item) => (item.id ? [item.id] : [])));
  const idsToDelete = [...existingIds].filter((id) => !keptIds.has(id));
  const toUpdate = lineItems.filter(
    (item): item is UpdateLineItemInput & { id: string } => !!item.id,
  );
  const toCreate = lineItems.filter((item) => !item.id);

  // An edit to a claim whose approval chain has already started (spec §3.2's "amount changes
  // mid-chain" case) discards the whole chain and recomputes it from scratch against the new
  // total — any partial approval at the old amount doesn't guarantee validity at the new one.
  // The same reset also covers resubmission after rejection (spec §3.3).
  await prisma.$transaction(async (tx) => {
    if (idsToDelete.length > 0) {
      await tx.lineItem.deleteMany({ where: { id: { in: idsToDelete }, claimId } });
    }

    for (const item of toUpdate) {
      await tx.lineItem.update({
        where: { id: item.id },
        data: {
          date: item.date,
          category: item.category,
          customCategory: item.customCategory,
          amount: item.amount,
          description: item.description,
        },
      });
    }

    if (toCreate.length > 0) {
      await tx.lineItem.createMany({
        data: toCreate.map((item) => ({
          claimId,
          date: item.date,
          category: item.category,
          customCategory: item.customCategory,
          amount: item.amount,
          description: item.description,
        })),
      });
    }

    await routeClaim(tx, claimId, claimantId);

    await tx.claimEvent.create({
      data: {
        claimId,
        type: existing.status === "REJECTED" ? "RESUBMITTED" : "EDITED",
        actorId: claimantId,
      },
    });
  });

  return getClaimForClaimant(claimId, claimantId);
}

export async function deleteClaim(claimantId: string, claimId: string) {
  const claim = await getClaimForClaimant(claimId, claimantId);

  if (claim.status !== "PENDING") {
    throw new ConflictError(`Only pending claims can be deleted`);
  }

  // Line items/attachments cascade at the DB level (onDelete: Cascade in schema.prisma) —
  // the caller still needs the pre-delete claim back to clean up attachment files on disk.
  await prisma.claim.delete({ where: { id: claimId } });

  return claim;
}

export interface AddAttachmentInput {
  filename: string;
  filePath: string;
  mimeType: string;
  size: number;
}

export async function addAttachment(
  claimantId: string,
  claimId: string,
  lineItemId: string,
  file: AddAttachmentInput,
) {
  const claim = await getClaimForClaimant(claimId, claimantId);

  if (claim.status === "APPROVED") {
    throw new ConflictError(`Claim ${claimId} is approved and is read-only`);
  }

  const lineItem = claim.lineItems.find((item) => item.id === lineItemId);
  if (!lineItem) {
    throw new NotFoundError("Line item not found on this claim");
  }

  return prisma.attachment.create({
    data: {
      lineItemId,
      filename: file.filename,
      filePath: file.filePath,
      mimeType: file.mimeType,
      size: file.size,
    },
  });
}

export async function getAttachmentForClaimant(
  claimantId: string,
  claimId: string,
  lineItemId: string,
  attachmentId: string,
) {
  const claim = await getClaimForClaimant(claimId, claimantId);
  const lineItem = claim.lineItems.find((item) => item.id === lineItemId);
  const attachment = lineItem?.attachments.find((item) => item.id === attachmentId);

  if (!attachment) {
    throw new NotFoundError("Attachment not found");
  }

  return attachment;
}

export async function deleteAttachment(
  claimantId: string,
  claimId: string,
  lineItemId: string,
  attachmentId: string,
) {
  const claim = await getClaimForClaimant(claimId, claimantId);

  if (claim.status === "APPROVED") {
    throw new ConflictError(`Claim ${claimId} is approved and is read-only`);
  }

  const attachment = await getAttachmentForClaimant(claimantId, claimId, lineItemId, attachmentId);
  await prisma.attachment.delete({ where: { id: attachmentId } });
  return attachment;
}
