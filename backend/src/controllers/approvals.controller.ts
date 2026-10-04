import type { Request, Response } from "express";
import { z } from "zod";
import { UPLOAD_ROOT } from "../constants/storage";
import * as approvalsService from "../services/approvals.service";

const listQuerySchema = z.object({
  decided: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  status: z.enum(["APPROVED", "REJECTED"]).optional(),
  from: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Enter a valid from date" })
    .optional(),
  to: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Enter a valid to date" })
    .optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const decisionSchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT"], { message: "action must be APPROVE or REJECT" }),
    reason: z.string().trim().max(500, "Reason must be at most 500 characters").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "REJECT" && !data.reason) {
      ctx.addIssue({
        code: "custom",
        message: "A reason is required to reject a claim",
        path: ["reason"],
      });
    }
  });

export async function listQueueHandler(req: Request, res: Response) {
  const query = listQuerySchema.parse(req.query);

  const { claims, pagination } = await approvalsService.listQueueForApprover(req.user!.id, {
    decided: query.decided,
    status: query.status,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
  });

  res.json({ claims, pagination });
}

export async function getQueuedClaimHandler(req: Request, res: Response) {
  const id = z.string().parse(req.params.id);
  const claim = await approvalsService.getClaimForApprover(id, req.user!.id);
  res.json({ claim });
}

export async function decideHandler(req: Request, res: Response) {
  const id = z.string().parse(req.params.id);
  const input = decisionSchema.parse(req.body);

  const claim = await approvalsService.decideOnClaim(id, req.user!.id, input);
  res.json({ claim });
}

export async function downloadQueuedAttachmentHandler(req: Request, res: Response) {
  const claimId = z.string().parse(req.params.claimId);
  const lineItemId = z.string().parse(req.params.lineItemId);
  const attachmentId = z.string().parse(req.params.attachmentId);

  const attachment = await approvalsService.getAttachmentForApprover(
    claimId,
    lineItemId,
    attachmentId,
    req.user!.id,
  );

  res.download(attachment.filePath, attachment.filename, { root: UPLOAD_ROOT });
}
