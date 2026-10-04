import request from "supertest";
import { prisma } from "../lib/prisma";
import { app, registerUser } from "./test-helpers";

// Spec §6: "Trying to edit an already-approved claim... should come back as a clear, specific
// failure — not a silent no-op and not a generic error." Exercised here through the ordinary
// API (not raw SQL — see claim-total-integrity.test.ts for the DB-trigger-level version of
// this same invariant).
describe("approved-claim immutability (via the API)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createAndApproveClaim() {
    const approver = await registerUser("APPROVER");
    const claimant = await registerUser("CLAIMANT", { managerEmail: approver.email });

    const createRes = await request(app)
      .post("/api/claims")
      .set("Authorization", `Bearer ${claimant.token}`)
      .send({
        lineItems: [{ date: "2026-01-01", category: "MEALS", amount: 25, description: "Lunch" }],
      });
    const claimId: string = createRes.body.claim.id;

    const decideRes = await request(app)
      .post(`/api/approvals/${claimId}/decision`)
      .set("Authorization", `Bearer ${approver.token}`)
      .send({ action: "APPROVE" });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.claim.status).toBe("APPROVED");

    return { claimant, claimId };
  }

  it("refuses to edit an approved claim's line items with a specific, non-generic error", async () => {
    const { claimant, claimId } = await createAndApproveClaim();

    const res = await request(app)
      .put(`/api/claims/${claimId}`)
      .set("Authorization", `Bearer ${claimant.token}`)
      .send({
        lineItems: [
          { date: "2026-01-01", category: "MEALS", amount: 999, description: "Tampered" },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.message).toContain("approved");
    expect(res.body.error.message).toContain(claimId);

    // Confirm the edit genuinely had no effect — not a silent no-op that still returned 200.
    const reloaded = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } });
    expect(Number(reloaded.totalAmount)).toBe(25);
  });

  it("refuses to delete an approved claim with a specific error", async () => {
    const { claimant, claimId } = await createAndApproveClaim();

    const res = await request(app)
      .delete(`/api/claims/${claimId}`)
      .set("Authorization", `Bearer ${claimant.token}`);

    expect(res.status).toBe(409);
    expect(res.body.error.message.toLowerCase()).toContain("pending");

    const stillThere = await prisma.claim.findUnique({ where: { id: claimId } });
    expect(stillThere).not.toBeNull();
  });

  it("refuses to add an attachment to an approved claim's line item", async () => {
    const { claimant, claimId } = await createAndApproveClaim();
    const claim = await prisma.claim.findUniqueOrThrow({
      where: { id: claimId },
      include: { lineItems: true },
    });
    const lineItemId = claim.lineItems[0].id;

    const res = await request(app)
      .post(`/api/claims/${claimId}/line-items/${lineItemId}/attachments`)
      .set("Authorization", `Bearer ${claimant.token}`)
      .attach("file", Buffer.from("%PDF-1.4 fake"), {
        filename: "receipt.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain("approved");
  });
});
