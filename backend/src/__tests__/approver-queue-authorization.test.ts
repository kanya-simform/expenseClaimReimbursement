import request from "supertest";
import { prisma } from "../lib/prisma";
import { app, registerUser } from "./test-helpers";

// Spec §6: "This is the sharpest test in this POC: an approver requesting a claim outside
// their queue, directly by its ID, must be refused at the point of the query — not merely
// hidden by the UI."
describe("approver authorization — outside queue by ID", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("refuses a claim that is not yet this approver's turn, identically to no involvement at all", async () => {
    const carol = await registerUser("APPROVER"); // tier 2
    const bob = await registerUser("APPROVER", { managerEmail: carol.email }); // tier 1
    const alice = await registerUser("CLAIMANT", { managerEmail: bob.email });
    const zara = await registerUser("APPROVER"); // no involvement on this claim at all

    // >= the $500 second-tier threshold (approval-routing.ts) — routes to Bob then Carol.
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

    // Carol has a real ApprovalStep on this claim (tier 2) — but it isn't her turn yet, since
    // Bob hasn't approved tier 1. This must be refused at the query itself.
    const carolGet = await request(app)
      .get(`/api/approvals/${claimId}`)
      .set("Authorization", `Bearer ${carol.token}`);
    expect(carolGet.status).toBe(404);

    // Zara has no ApprovalStep on this claim whatsoever.
    const zaraGet = await request(app)
      .get(`/api/approvals/${claimId}`)
      .set("Authorization", `Bearer ${zara.token}`);
    expect(zaraGet.status).toBe(404);

    // The response can't be used to distinguish "routed to you later" from "never involved" —
    // same status, same message, both ways.
    expect(carolGet.body).toEqual(zaraGet.body);

    // Carol also can't act on it directly, not just view it.
    const carolDecide = await request(app)
      .post(`/api/approvals/${claimId}/decision`)
      .set("Authorization", `Bearer ${carol.token}`)
      .send({ action: "APPROVE" });
    expect(carolDecide.status).toBe(404);

    // Sanity check: the claim genuinely exists and genuinely is routed to Bob right now —
    // the refusals above are about queue position, not a bug blocking everyone.
    const bobGet = await request(app)
      .get(`/api/approvals/${claimId}`)
      .set("Authorization", `Bearer ${bob.token}`);
    expect(bobGet.status).toBe(200);
    expect(bobGet.body.claim.id).toBe(claimId);
  });

  it("refuses a claimant's own claim fetched through the approver's single-claim route", async () => {
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
    const res = await request(app)
      .get(`/api/approvals/${claimId}`)
      .set("Authorization", `Bearer ${otherApprover.token}`);

    expect(res.status).toBe(404);
  });
});
