import { Router } from "express";
import {
  exportCsvHandler,
  getClaimHandler,
  listClaimsHandler,
} from "../controllers/finance.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const financeRouter = Router();

financeRouter.use(requireAuth, requireRole("FINANCE"));

financeRouter.get("/claims", listClaimsHandler);
financeRouter.get("/claims/:id", getClaimHandler);
financeRouter.get("/export", exportCsvHandler);
