import request from "supertest";
import { prisma } from "../lib/prisma";
import { app, registerUser } from "./test-helpers";

// Spec §6: "Every route requires a real, authenticated user."
describe("authentication is required on every protected route", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const protectedRoutes: Array<{ method: "get" | "post"; path: string }> = [
    { method: "get", path: "/api/auth/me" },
    { method: "get", path: "/api/claims" },
    { method: "post", path: "/api/claims" },
    { method: "get", path: "/api/approvals" },
    { method: "get", path: "/api/finance/claims" },
    { method: "get", path: "/api/finance/export" },
  ];

  it.each(protectedRoutes)("refuses $method $path with no Authorization header", async (route) => {
    const res = await request(app)[route.method](route.path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it.each(protectedRoutes)("refuses $method $path with a malformed token", async (route) => {
    const res = await request(app)
      [route.method](route.path)
      .set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
  });

  it("refuses a well-formed but tampered/invalid-signature token", async () => {
    const claimant = await registerUser("CLAIMANT");
    // Flip the last character of the signature segment — same shape, invalid signature.
    const parts = claimant.token.split(".");
    const tamperedSignature = parts[2].slice(0, -1) + (parts[2].endsWith("A") ? "B" : "A");
    const tamperedToken = [parts[0], parts[1], tamperedSignature].join(".");

    const res = await request(app)
      .get("/api/claims")
      .set("Authorization", `Bearer ${tamperedToken}`);

    expect(res.status).toBe(401);
  });

  it("login and register themselves do not require authentication", async () => {
    // Sanity check the inverse — these must stay reachable without a token, or no one could
    // ever get one in the first place.
    const res = await request(app).post("/api/auth/login").send({
      email: "nobody@example.com",
      password: "whatever",
    });
    expect(res.status).toBe(401); // wrong credentials, not 401-for-missing-auth
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  describe("role boundaries, once authenticated", () => {
    it("refuses a CLAIMANT on approver/finance-only routes", async () => {
      const claimant = await registerUser("CLAIMANT");

      const approvalsRes = await request(app)
        .get("/api/approvals")
        .set("Authorization", `Bearer ${claimant.token}`);
      expect(approvalsRes.status).toBe(403);

      const financeRes = await request(app)
        .get("/api/finance/claims")
        .set("Authorization", `Bearer ${claimant.token}`);
      expect(financeRes.status).toBe(403);
    });

    it("refuses FINANCE on claim-submission and approval routes", async () => {
      const finance = await registerUser("FINANCE");

      const createClaimRes = await request(app)
        .post("/api/claims")
        .set("Authorization", `Bearer ${finance.token}`)
        .send({ lineItems: [] });
      expect(createClaimRes.status).toBe(403);

      const approvalsRes = await request(app)
        .get("/api/approvals")
        .set("Authorization", `Bearer ${finance.token}`);
      expect(approvalsRes.status).toBe(403);
    });
  });
});
