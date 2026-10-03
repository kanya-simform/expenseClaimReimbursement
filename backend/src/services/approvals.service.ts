import { Prisma } from "../../generated/prisma/client";
import { NotFoundError } from "../errors";
import { buildPaginationMeta, resolvePagination, type PaginationInput } from "../lib/pagination";
import { prisma } from "../lib/prisma";

const APPROVAL_CLAIM_INCLUDE = {
  claimant: { select: { id: true, firstName: true, lastName: true, email: true } },
  lineItems: { include: { attachments: true }, orderBy: { id: "asc" } },
  approvalSteps: {
    include: { approver: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { sequence: "asc" },
  },
  events: {
    include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  },
} as const;

export interface QueueFilters extends PaginationInput {
  decided?: boolean;
  status?: "APPROVED" | "REJECTED";
  from?: Date;
  to?: Date;
  search?: string;
}

export async function listQueueForApprover(approverId: string, filters: QueueFilters = {}) {
  const { page, pageSize, skip, take } = resolvePagination(filters);

  const createdAtWhere: Prisma.ClaimWhereInput = {
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  if (filters.decided) {
    // Matches via ApprovalStep (the current chain) OR ClaimEvent (every decision this
    // approver has ever made on the claim, including ones a later edit's chain reset has
    // since deleted from ApprovalStep — see routeClaim in claims.service.ts).
    const decidedCondition: Prisma.ClaimWhereInput = {
      OR: [
        { approvalSteps: { some: { approverId, status: filters.status ?? { not: "PENDING" } } } },
        {
          events: {
            some: {
              actorId: approverId,
              type: filters.status ?? { in: ["APPROVED", "REJECTED"] },
            },
          },
        },
      ],
    };

    const searchCondition: Prisma.ClaimWhereInput | undefined = filters.search
      ? {
          OR: [
            { claimant: { firstName: { contains: filters.search, mode: "insensitive" } } },
            { claimant: { lastName: { contains: filters.search, mode: "insensitive" } } },
            { claimant: { email: { contains: filters.search, mode: "insensitive" } } },
            {
              lineItems: {
                some: { description: { contains: filters.search, mode: "insensitive" } },
              },
            },
          ],
        }
      : undefined;

    const where: Prisma.ClaimWhereInput = {
      ...createdAtWhere,
      AND: [decidedCondition, ...(searchCondition ? [searchCondition] : [])],
    };

    const [claims, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        include: APPROVAL_CLAIM_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.claim.count({ where }),
    ]);

    return { claims, pagination: buildPaginationMeta(total, page, pageSize) };
  }

  // "Currently routed to me" can't be expressed as a plain Prisma relation filter — it needs
  // to compare the step's own sequence against its *parent* claim's currentStep, which Prisma
  // has no way to reference across a relation. Pushing that comparison into SQL keeps this to
  // one indexed query instead of pulling every claim into memory to filter in JS (spec §6).
  const conditions: Prisma.Sql[] = [
    Prisma.sql`c.status = 'PENDING'`,
    Prisma.sql`s.approver_id = ${approverId}`,
    Prisma.sql`s.status = 'PENDING'`,
    Prisma.sql`s.sequence = c.current_step + 1`,
  ];
  if (filters.from) conditions.push(Prisma.sql`c.created_at >= ${filters.from}`);
  if (filters.to) conditions.push(Prisma.sql`c.created_at <= ${filters.to}`);
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(Prisma.sql`(
      EXISTS (
        SELECT 1 FROM users u WHERE u.id = c.claimant_id
        AND (u.first_name ILIKE ${pattern} OR u.last_name ILIKE ${pattern} OR u.email ILIKE ${pattern})
      )
      OR EXISTS (
        SELECT 1 FROM line_items li WHERE li.claim_id = c.id AND li.description ILIKE ${pattern}
      )
    )`);
  }

  const whereClause = Prisma.join(conditions, " AND ");

  const [totalRows, activeClaims] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT c.id) as count FROM claims c
      JOIN approval_steps s ON s.claim_id = c.id
      WHERE ${whereClause}
    `,
    prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT c.id, c.created_at FROM claims c
      JOIN approval_steps s ON s.claim_id = c.id
      WHERE ${whereClause}
      ORDER BY c.created_at ASC
      LIMIT ${take} OFFSET ${skip}
    `,
  ]);

  const total = Number(totalRows[0]?.count ?? 0);

  if (activeClaims.length === 0) {
    return { claims: [], pagination: buildPaginationMeta(total, page, pageSize) };
  }

  const claims = await prisma.claim.findMany({
    where: { id: { in: activeClaims.map((row) => row.id) } },
    include: APPROVAL_CLAIM_INCLUDE,
  });

  // Preserve the SQL query's ordering (findMany with `id: { in }` does not).
  const order = new Map(activeClaims.map((row, index) => [row.id, index]));
  const ordered = claims.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  return { claims: ordered, pagination: buildPaginationMeta(total, page, pageSize) };
}

export async function getClaimForApprover(claimId: string, approverId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: APPROVAL_CLAIM_INCLUDE,
  });

  if (!claim) {
    throw new NotFoundError("Claim not found");
  }

  const myStep = claim.approvalSteps.find((step) => step.approverId === approverId);
  const isMyActiveTurn = myStep?.status === "PENDING" && myStep.sequence === claim.currentStep + 1;
  const stepAlreadyDecided = myStep && myStep.status !== "PENDING";
  const previouslyDecided = claim.events.some(
    (event) =>
      event.actorId === approverId && (event.type === "APPROVED" || event.type === "REJECTED"),
  );

  // Same 404, same message, whether this approver has no involvement at all or has one that
  // just isn't active yet — the response can't be used to probe for a future assignment.
  if (!isMyActiveTurn && !stepAlreadyDecided && !previouslyDecided) {
    throw new NotFoundError("Claim not found");
  }

  return claim;
}

export async function getAttachmentForApprover(
  claimId: string,
  lineItemId: string,
  attachmentId: string,
  approverId: string,
) {
  const claim = await getClaimForApprover(claimId, approverId);
  const lineItem = claim.lineItems.find((item) => item.id === lineItemId);
  const attachment = lineItem?.attachments.find((item) => item.id === attachmentId);

  if (!attachment) {
    throw new NotFoundError("Attachment not found");
  }

  return attachment;
}

export interface DecisionInput {
  action: "APPROVE" | "REJECT";
  reason?: string;
}

export async function decideOnClaim(claimId: string, approverId: string, input: DecisionInput) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { approvalSteps: true },
  });

  if (!claim) {
    throw new NotFoundError("Claim not found in your approval queue");
  }

  const myStep = claim.approvalSteps.find(
    (step) =>
      step.approverId === approverId &&
      step.status === "PENDING" &&
      step.sequence === claim.currentStep + 1,
  );

  if (!myStep) {
    throw new NotFoundError("Claim not found in your approval queue");
  }

  if (input.action === "REJECT") {
    await prisma.$transaction([
      prisma.approvalStep.update({
        where: { id: myStep.id },
        data: { status: "REJECTED", decidedAt: new Date(), reason: input.reason },
      }),
      prisma.claim.update({ where: { id: claimId }, data: { status: "REJECTED" } }),
      prisma.claimEvent.create({
        data: {
          claimId,
          type: "REJECTED",
          actorId: approverId,
          reason: input.reason,
          metadata: { sequence: myStep.sequence },
        },
      }),
    ]);
  } else {
    const isFinalStep = myStep.sequence === claim.approvalSteps.length;

    await prisma.$transaction([
      prisma.approvalStep.update({
        where: { id: myStep.id },
        data: { status: "APPROVED", decidedAt: new Date() },
      }),
      prisma.claim.update({
        where: { id: claimId },
        data: {
          currentStep: myStep.sequence,
          ...(isFinalStep ? { status: "APPROVED" as const } : {}),
        },
      }),
      // Logged for every tier, not just the final one — an edit mid-chain (routeClaim)
      // deletes ApprovalStep rows to recompute the chain, so this is the only record of an
      // intermediate approval that survives that reset (spec §6's "structured trace").
      prisma.claimEvent.create({
        data: {
          claimId,
          type: "APPROVED",
          actorId: approverId,
          metadata: { sequence: myStep.sequence, final: isFinalStep },
        },
      }),
    ]);
  }

  return getClaimForApprover(claimId, approverId);
}
