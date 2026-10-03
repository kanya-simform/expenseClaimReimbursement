import bcrypt from "bcrypt";
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
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: "8h" });
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new UnauthenticatedError("Invalid email or password");
  }

  return { accessToken: signAccessToken(user), user: toPublicUser(user) };
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
    // Only an APPROVER can sit in the approval chain — see approval-routing.ts (spec §3.2).
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

  return { accessToken: signAccessToken(user), user: toPublicUser(user) };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("User not found");
  }
  return toPublicUser(user);
}
