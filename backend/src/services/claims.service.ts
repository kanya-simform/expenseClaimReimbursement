import { ConflictError, NotFoundError } from "../errors";
import { prisma } from "../lib/prisma";

// Ordering by id (a k-sortable cuid) rather than leaving it to incidental Postgres row
// order — the frontend matches newly staged receipt uploads to newly created line items
// by creation order, which needs to be deterministic.
const CLAIM_INCLUDE = {
  lineItems: { include: { attachments: true }, orderBy: { id: "asc" } },
} as const;

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
    include: CLAIM_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
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

  await prisma.$transaction([
    ...(idsToDelete.length > 0
      ? [prisma.lineItem.deleteMany({ where: { id: { in: idsToDelete }, claimId } })]
      : []),
    ...toUpdate.map((item) =>
      prisma.lineItem.update({
        where: { id: item.id },
        data: {
          date: item.date,
          category: item.category,
          customCategory: item.customCategory,
          amount: item.amount,
          description: item.description,
        },
      }),
    ),
    ...(toCreate.length > 0
      ? [
          prisma.lineItem.createMany({
            data: toCreate.map((item) => ({
              claimId,
              date: item.date,
              category: item.category,
              customCategory: item.customCategory,
              amount: item.amount,
              description: item.description,
            })),
          }),
        ]
      : []),
    // A rejected claim being edited is being resubmitted — spec §3.3.
    ...(existing.status === "REJECTED"
      ? [prisma.claim.update({ where: { id: claimId }, data: { status: "PENDING" as const } })]
      : []),
  ]);

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
