import request from "supertest";
import { prisma } from "../lib/prisma";
import { app, registerUser } from "./test-helpers";

describe("approver authorization — outside queue by ID", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("refuses a claim that is not yet this approver's turn, identically to no involvement at all", async () => {
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

    const carolGet = await request(app)
      .get(`/api/approvals/${claimId}`)
      .set("Authorization", `Bearer ${carol.token}`);
    expect(carolGet.status).toBe(404);

    const zaraGet = await request(app)
      .get(`/api/approvals/${claimId}`)
      .set("Authorization", `Bearer ${zara.token}`);
    expect(zaraGet.status).toBe(404);

    expect(carolGet.body).toEqual(zaraGet.body);

    const carolDecide = await request(app)
      .post(`/api/approvals/${claimId}/decision`)
      .set("Authorization", `Bearer ${carol.token}`)
      .send({ action: "APPROVE" });
    expect(carolDecide.status).toBe(404);

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
