import { Router } from "express";
import { loginHandler, meHandler, registerHandler } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/login", loginHandler);
authRouter.post("/register", registerHandler);
authRouter.get("/me", requireAuth, meHandler);
