import { Router } from "express";
import {
  createClaimHandler,
  getClaimHandler,
  listClaimsHandler,
} from "../controllers/claims.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const claimsRouter = Router();

claimsRouter.use(requireAuth, requireRole("CLAIMANT"));

claimsRouter.post("/", createClaimHandler);
claimsRouter.get("/", listClaimsHandler);
claimsRouter.get("/:id", getClaimHandler);
