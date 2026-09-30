import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../errors";
import { logger } from "../lib/logger";

// DB trigger exceptions (RAISE EXCEPTION ... USING ERRCODE = '22000', see
// prisma/migrations/20260921080405_add_claim_integrity_triggers/migration.sql) don't come
// back as a typed Prisma error — the query engine surfaces them as a
// PrismaClientUnknownRequestError whose .message embeds the raw Postgres error as a
// Rust-debug-formatted string, e.g.:
//   PostgresError { code: "22000", message: "Claim <id> is approved and is read-only", ... }
const TRIGGER_ERROR_PATTERN = /PostgresError \{ code: "([^"]+)", message: "([^"]*)"/;

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues,
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: { code: "CONFLICT", message: "A record with these details already exists" },
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
    }
  }

  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    const match = TRIGGER_ERROR_PATTERN.exec(err.message);
    if (match) {
      const [, , triggerMessage] = match;
      return res.status(409).json({ error: { code: "CONFLICT", message: triggerMessage } });
    }
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
