import type { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EXPENSE_CATEGORIES } from "../constants/categories";
import { UPLOAD_ROOT } from "../constants/storage";
import { ValidationError } from "../errors";
import * as claimsService from "../services/claims.service";

const lineItemFields = {
  date: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Enter a valid date" }),
  category: z.enum(EXPENSE_CATEGORIES, { message: "Select a valid category" }),
  customCategory: z
    .string()
    .trim()
    .max(100, "Custom category must be at most 100 characters")
    .optional(),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than 0")
    .max(1_000_000, "Amount must be at most 1,000,000"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(255, "Description must be at most 255 characters"),
};

function requireCustomCategoryWhenOther(data: { category: string; customCategory?: string }, ctx: z.RefinementCtx) {
  if (data.category === "OTHER" && !data.customCategory) {
    ctx.addIssue({ code: "custom", message: "Specify the category", path: ["customCategory"] });
  }
}

const createLineItemSchema = z.object(lineItemFields).superRefine(requireCustomCategoryWhenOther);
const updateLineItemSchema = z
  .object({ id: z.string().optional(), ...lineItemFields })
  .superRefine(requireCustomCategoryWhenOther);

const createClaimSchema = z.object({
  lineItems: z.array(createLineItemSchema).min(1, "Add at least one line item"),
});

const updateClaimSchema = z.object({
  lineItems: z.array(updateLineItemSchema).min(1, "Add at least one line item"),
});

export async function createClaimHandler(req: Request, res: Response) {
  const { lineItems } = createClaimSchema.parse(req.body);

  const claim = await claimsService.createClaim(
    req.user!.id,
    lineItems.map((item) => ({
      ...item,
      date: new Date(item.date),
      customCategory: item.category === "OTHER" ? (item.customCategory ?? null) : null,
    })),
  );

  res.status(201).json({ claim });
}

export async function listClaimsHandler(req: Request, res: Response) {
  const claims = await claimsService.listClaimsForClaimant(req.user!.id);
  res.json({ claims });
}

export async function getClaimHandler(req: Request, res: Response) {
  const id = z.string().parse(req.params.id);
  const claim = await claimsService.getClaimForClaimant(id, req.user!.id);
  res.json({ claim });
}

export async function updateClaimHandler(req: Request, res: Response) {
  const id = z.string().parse(req.params.id);
  const { lineItems } = updateClaimSchema.parse(req.body);

  const claim = await claimsService.updateClaim(
    id,
    req.user!.id,
    lineItems.map((item) => ({
      ...item,
      date: new Date(item.date),
      customCategory: item.category === "OTHER" ? (item.customCategory ?? null) : null,
    })),
  );

  res.json({ claim });
}

export async function uploadAttachmentHandler(req: Request, res: Response) {
  const claimId = z.string().parse(req.params.claimId);
  const lineItemId = z.string().parse(req.params.lineItemId);

  if (!req.file) {
    throw new ValidationError("A file is required");
  }

  const attachment = await claimsService.addAttachment(req.user!.id, claimId, lineItemId, {
    filename: req.file.originalname,
    filePath: `${claimId}/${req.file.filename}`,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });

  res.status(201).json({ attachment });
}

export async function downloadAttachmentHandler(req: Request, res: Response) {
  const claimId = z.string().parse(req.params.claimId);
  const lineItemId = z.string().parse(req.params.lineItemId);
  const attachmentId = z.string().parse(req.params.attachmentId);

  const attachment = await claimsService.getAttachmentForClaimant(
    req.user!.id,
    claimId,
    lineItemId,
    attachmentId,
  );

  res.download(attachment.filePath, attachment.filename, { root: UPLOAD_ROOT });
}

export async function deleteAttachmentHandler(req: Request, res: Response) {
  const claimId = z.string().parse(req.params.claimId);
  const lineItemId = z.string().parse(req.params.lineItemId);
  const attachmentId = z.string().parse(req.params.attachmentId);

  const attachment = await claimsService.deleteAttachment(
    req.user!.id,
    claimId,
    lineItemId,
    attachmentId,
  );

  await fs.unlink(path.join(UPLOAD_ROOT, attachment.filePath)).catch(() => {});

  res.status(204).send();
}
