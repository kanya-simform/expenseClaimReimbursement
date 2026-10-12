import bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ConflictError, NotFoundError, UnauthenticatedError, ValidationError } from "../errors";
import type { UserRole } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";

const BCRYPT_ROUNDS = 10;

function toPublicUser(user: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
}) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  };
}

function signAccessToken(user: { id: string; role: UserRole }) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
  });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function issueRefreshToken(userId: string) {
  const token = randomBytes(48).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

async function startSession(user: Parameters<typeof toPublicUser>[0]) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: await issueRefreshToken(user.id),
    user: toPublicUser(user),
  };
}

export async function refresh(refreshToken: string) {
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) {
    throw new UnauthenticatedError("Invalid refresh token");
  }

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthenticatedError("Refresh token has been revoked");
  }

  if (stored.expiresAt <= new Date()) {
    throw new UnauthenticatedError("Refresh token has expired");
  }

  const claimed = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new UnauthenticatedError("Refresh token has been revoked");
  }

  return startSession(stored.user);
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new UnauthenticatedError("Invalid email or password");
  }

  return startSession(user);
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
  managerEmail?: string;
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("An account with this email already exists");
  }

  let managerId: string | undefined;
  if (input.managerEmail) {
    const manager = await prisma.user.findUnique({ where: { email: input.managerEmail } });
    if (!manager) {
      throw new ValidationError("No account exists with that manager email");
    }
    if (manager.role !== "APPROVER") {
      throw new ValidationError("The manager account must have the Approver role");
    }
    managerId = manager.id;
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
      role: input.role,
      managerId,
    },
  });

  return startSession(user);
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("User not found");
  }
  return toPublicUser(user);
}
