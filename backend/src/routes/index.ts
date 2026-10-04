import { Router } from "express";
import { authRouter } from "./auth.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
