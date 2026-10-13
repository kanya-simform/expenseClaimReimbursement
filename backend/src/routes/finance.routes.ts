import { Router } from "express";
import { exportCsvHandler, listClaimsHandler } from "../controllers/finance.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const financeRouter = Router();

financeRouter.use(requireAuth, requireRole("FINANCE"));

financeRouter.get("/claims", listClaimsHandler);
financeRouter.get("/export", exportCsvHandler);
