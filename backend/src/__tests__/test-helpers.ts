import request from "supertest";
import { createApp } from "../app";
import type { UserRole } from "../../generated/prisma/client";

export const app = createApp();

// A fixed strong password satisfying both the length and strength checks (auth.controller.ts).
const TEST_PASSWORD = "Str0ng!TestPass9";

let counter = 0;

function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}@example.com`;
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export async function registerUser(
  role: UserRole,
  options: { managerEmail?: string } = {},
): Promise<TestUser> {
  const email = uniqueEmail(role.toLowerCase());

  const res = await request(app).post("/api/auth/register").send({
    firstName: role,
    lastName: "Tester",
    email,
    password: TEST_PASSWORD,
    confirmPassword: TEST_PASSWORD,
    role,
    managerEmail: options.managerEmail,
  });

  if (res.status !== 201) {
    throw new Error(`registerUser(${role}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { id: res.body.user.id, email, token: res.body.accessToken as string };
}
