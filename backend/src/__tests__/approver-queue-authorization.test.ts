import request from "supertest";
import { prisma } from "../lib/prisma";
import { app, registerUser } from "./test-helpers";

async function queueClaimIds(token: string): Promise<string[]> {
  const res = await request(app).get("/api/approvals").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.claims.map((claim: { id: string }) => claim.id);
}

describe("approver authorization — outside queue by ID", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("hides a claim that is not yet this approver's turn, identically to no involvement at all", async () => {
    const carol = await registerUser("APPROVER");
    const bob = await registerUser("APPROVER", { managerEmail: carol.email });
    const alice = await registerUser("CLAIMANT", { managerEmail: bob.email });
    const zara = await registerUser("APPROVER");

    const createRes = await request(app)
      .post("/api/claims")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        lineItems: [
          { date: "2026-01-01", category: "TRAVEL", amount: 800, description: "Conference" },
        ],
      });

    expect(createRes.status).toBe(201);
    const claimId: string = createRes.body.claim.id;

    const carolQueue = await request(app)
      .get("/api/approvals")
      .set("Authorization", `Bearer ${carol.token}`);
    const zaraQueue = await request(app)
      .get("/api/approvals")
      .set("Authorization", `Bearer ${zara.token}`);

    expect(carolQueue.body.claims.map((claim: { id: string }) => claim.id)).not.toContain(claimId);
    expect(zaraQueue.body.claims.map((claim: { id: string }) => claim.id)).not.toContain(claimId);
    expect(carolQueue.body).toEqual(zaraQueue.body);

    const carolDecide = await request(app)
      .post(`/api/approvals/${claimId}/decision`)
      .set("Authorization", `Bearer ${carol.token}`)
      .send({ action: "APPROVE" });
    expect(carolDecide.status).toBe(404);

    expect(await queueClaimIds(bob.token)).toContain(claimId);
  });

  it("refuses a decision from an approver who is not in the claim's chain", async () => {
    const carol = await registerUser("APPROVER");
    const alice = await registerUser("CLAIMANT", { managerEmail: carol.email });

    const createRes = await request(app)
      .post("/api/claims")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({
        lineItems: [{ date: "2026-01-01", category: "MEALS", amount: 20, description: "Lunch" }],
      });

    const claimId: string = createRes.body.claim.id;

    const otherApprover = await registerUser("APPROVER");
    expect(await queueClaimIds(otherApprover.token)).not.toContain(claimId);

    const res = await request(app)
      .post(`/api/approvals/${claimId}/decision`)
      .set("Authorization", `Bearer ${otherApprover.token}`)
      .send({ action: "APPROVE" });

    expect(res.status).toBe(404);
  });
});
