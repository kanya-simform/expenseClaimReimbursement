import { Prisma } from "../../generated/prisma/client";
import { SECOND_TIER_THRESHOLD } from "../constants/approvals";
import { ValidationError } from "../errors";

// Routing rule (spec §3.2): tier 1 is always the claimant's manager; tier 2 (only required
// once the claim total reaches SECOND_TIER_THRESHOLD) is that manager's manager. Deterministic
// per claimant — exactly one possible approver per tier — which is what makes "an approver
// outside their queue" straightforward to refuse at the query level later.
export async function resolveApprovalChain(
  tx: Prisma.TransactionClient,
  claimantId: string,
  totalAmount: Prisma.Decimal,
): Promise<string[]> {
  const claimant = await tx.user.findUniqueOrThrow({
    where: { id: claimantId },
    include: { manager: { include: { manager: true } } },
  });

  if (!claimant.manager) {
    throw new ValidationError(
      "Your manager must be configured before you can submit a claim. Ask an administrator to set it.",
    );
  }

  const chain = [claimant.manager.id];

  if (Number(totalAmount) >= SECOND_TIER_THRESHOLD) {
    if (!claimant.manager.manager) {
      throw new ValidationError(
        `Claims of $${SECOND_TIER_THRESHOLD} or more require a second-tier approver, but your manager has no manager configured.`,
      );
    }
    chain.push(claimant.manager.manager.id);
  }

  return chain;
}
