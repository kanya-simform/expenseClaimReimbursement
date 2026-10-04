import { randomUUID } from "node:crypto";
import request from "supertest";
import { prisma } from "../lib/prisma";
import { app, registerUser } from "./test-helpers";

// Spec §6: "The claim total needs to be provably impossible to desynchronise from its line
// items. Write a test that tries to leave it mismatched and confirm it can't." These attack
// the database directly with $executeRawUnsafe, bypassing the application (and Prisma's own
// query builder) entirely — the trigger in migration 20260921080405 is what has to hold, not
// any service-layer check.
describe("claim total integrity", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("silently recomputes total_amount after a direct SQL UPDATE tries to desync it", async () => {
    const approver = await registerUser("APPROVER");
    const claimant = await registerUser("CLAIMANT", { managerEmail: approver.email });

    const createRes = await request(app)
      .post("/api/claims")
      .set("Authorization", `Bearer ${claimant.token}`)
      .send({
        lineItems: [
          { date: "2026-01-01", category: "MEALS", amount: 40, description: "Lunch" },
          { date: "2026-01-02", category: "TRAVEL", amount: 60, description: "Taxi" },
        ],
      });

    expect(createRes.status).toBe(201);
    const claimId: string = createRes.body.claim.id;
    expect(Number(createRes.body.claim.totalAmount)).toBe(100);

    await prisma.$executeRawUnsafe(
      `UPDATE claims SET total_amount = 999999 WHERE id = $1`,
      claimId,
    );

    const reloaded = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    expect(Number(reloaded.totalAmount)).toBe(100);
  });

  it("recomputes total_amount after a line item is inserted directly via SQL", async () => {
    const approver = await registerUser("APPROVER");
    const claimant = await registerUser("CLAIMANT", { managerEmail: approver.email });

    const createRes = await request(app)
      .post("/api/claims")
      .set("Authorization", `Bearer ${claimant.token}`)
      .send({
        lineItems: [{ date: "2026-01-01", category: "MEALS", amount: 20, description: "Snack" }],
      });

    const claimId: string = createRes.body.claim.id;

    await prisma.$executeRawUnsafe(
      `INSERT INTO line_items (id, claim_id, date, category, amount, description, created_at, updated_at)
       VALUES ($1, $2, '2026-01-02', 'TRAVEL', 500, 'Smuggled in directly via SQL', now(), now())`,
      randomUUID(),
      claimId,
    );

    const reloaded = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    expect(Number(reloaded.totalAmount)).toBe(520);
  });

  it("rejects any write to an already-approved claim's line items, even via raw SQL", async () => {
    const approver = await registerUser("APPROVER");
    const claimant = await registerUser("CLAIMANT", { managerEmail: approver.email });

    const createRes = await request(app)
      .post("/api/claims")
      .set("Authorization", `Bearer ${claimant.token}`)
      .send({
        lineItems: [{ date: "2026-01-01", category: "MEALS", amount: 20, description: "Lunch" }],
      });

    const claimId: string = createRes.body.claim.id;

    const decideRes = await request(app)
      .post(`/api/approvals/${claimId}/decision`)
      .set("Authorization", `Bearer ${approver.token}`)
      .send({ action: "APPROVE" });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.claim.status).toBe("APPROVED");

    await expect(
      prisma.$executeRawUnsafe(`UPDATE line_items SET amount = 9999 WHERE claim_id = $1`, claimId),
    ).rejects.toThrow();

    const reloaded = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    expect(Number(reloaded.totalAmount)).toBe(20);
  });
});
