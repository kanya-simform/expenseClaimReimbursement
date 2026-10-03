import type { Request, Response } from "express";
import { z } from "zod";
import { buildClaimsExportCsv } from "../lib/csv-export";
import { resolveTimeZone } from "../lib/timezone";
import * as financeService from "../services/finance.service";

const listQuerySchema = z.object({
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED"]).optional(),
  from: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Enter a valid from date" })
    .optional(),
  to: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Enter a valid to date" })
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const exportQuerySchema = z.object({
  status: z.enum(["DRAFT", "PENDING", "APPROVED", "REJECTED"]).default("APPROVED"),
  from: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid from date",
  }),
  to: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid to date",
  }),
});

export async function listClaimsHandler(req: Request, res: Response) {
  const query = listQuerySchema.parse(req.query);

  const { claims, pagination } = await financeService.listAllClaims({
    status: query.status,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    page: query.page,
    pageSize: query.pageSize,
  });

  res.json({ claims, pagination });
}

export async function getClaimHandler(req: Request, res: Response) {
  const id = z.string().parse(req.params.id);
  const claim = await financeService.getClaimForFinance(id);
  res.json({ claim });
}

export async function exportCsvHandler(req: Request, res: Response) {
  const { status, from, to } = exportQuerySchema.parse(req.query);
  const timeZone = resolveTimeZone(req.headers["x-timezone"]);

  const claims = await financeService.getClaimsForExport(status, new Date(from), new Date(to));
  const csv = buildClaimsExportCsv(claims, timeZone);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${status.toLowerCase()}-claims-${from}-to-${to}.csv"`,
  );
  res.send(csv);
}
