import type { Request, Response } from "express";
import { z } from "zod";
import { EXPENSE_CATEGORIES } from "../constants/categories";
import * as claimsService from "../services/claims.service";

const lineItemSchema = z.object({
  date: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Enter a valid date" }),
  category: z.enum(EXPENSE_CATEGORIES, { message: "Select a valid category" }),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than 0")
    .max(1_000_000, "Amount must be at most 1,000,000"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(255, "Description must be at most 255 characters"),
});

const createClaimSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

export async function createClaimHandler(req: Request, res: Response) {
  const { lineItems } = createClaimSchema.parse(req.body);

  const claim = await claimsService.createClaim(
    req.user!.id,
    lineItems.map((item) => ({ ...item, date: new Date(item.date) })),
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
