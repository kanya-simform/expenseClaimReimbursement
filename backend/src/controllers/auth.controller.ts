import type { Request, Response } from "express";
import { z } from "zod";
import * as authService from "../services/auth.service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(50, "First name must be at most 50 characters"),
    lastName: z.string().trim().min(1, "Last name is required").max(50, "Last name must be at most 50 characters"),
    email: z.string().min(1, "Email is required").max(255, "Email must be at most 255 characters").email("Enter a valid email"),
    // bcrypt silently ignores bytes past 72 — cap here so that isn't a silent surprise.
    password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be at most 72 characters"),
    confirmPassword: z.string(),
    role: z.enum(["CLAIMANT", "APPROVER", "FINANCE"], {
      message: "Select a valid role",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const result = await authService.login(email, password);
  res.json(result);
}

export async function registerHandler(req: Request, res: Response) {
  const { firstName, lastName, email, password, role } = registerSchema.parse(req.body);
  const result = await authService.register({ firstName, lastName, email, password, role });
  res.status(201).json(result);
}

export async function meHandler(req: Request, res: Response) {
  const user = await authService.getProfile(req.user!.id);
  res.json({ user });
}
