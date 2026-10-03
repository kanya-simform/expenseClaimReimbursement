import { Router } from "express";
import { approvalsRouter } from "./approvals.routes";
import { authRouter } from "./auth.routes";
import { claimsRouter } from "./claims.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/claims", claimsRouter);
apiRouter.use("/approvals", approvalsRouter);
