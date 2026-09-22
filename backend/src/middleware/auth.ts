import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ForbiddenError, UnauthenticatedError } from "../errors";

interface AccessTokenPayload {
  sub: string;
  role: "CLAIMANT" | "APPROVER" | "FINANCE";
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    throw new UnauthenticatedError();
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    throw new UnauthenticatedError("Invalid or expired token");
  }
}

export function requireRole(...roles: Array<"CLAIMANT" | "APPROVER" | "FINANCE">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new UnauthenticatedError();
    }
    next();
  };
}
