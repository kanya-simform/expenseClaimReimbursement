import { Router } from "express";
import { authRouter } from "./auth.routes";
import { claimsRouter } from "./claims.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/claims", claimsRouter);
