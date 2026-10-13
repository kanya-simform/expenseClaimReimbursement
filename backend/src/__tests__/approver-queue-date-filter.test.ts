import request from "supertest";
import { prisma } from "../lib/prisma";
import { app, registerUser } from "./test-helpers";

function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfLocalDayIso(date: string) {
  return new Date(`${date}T00:00:00`).toISOString();
}

function endOfLocalDayIso(date: string) {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

async function queueIds(
  token: string,
  params: { decided?: boolean; from?: string; to?: string },
): Promise<string[]> {
  const query: Record<string, string> = {};
  if (params.decided) query.decided = "true";
  if (params.from) query.from = startOfLocalDayIso(params.from);
  if (params.to) query.to = endOfLocalDayIso(params.to);

  const res = await request(app)
    .get("/api/approvals")
    .query(query)
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.claims.map((claim: { id: string }) => claim.id);
}

describe("approver queue date range filter", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("filters the pending and decided lists by the claim's created date, inclusive of the whole day", async () => {
    const approver = await registerUser("APPROVER");
    const claimant = await registerUser("CLAIMANT", { managerEmail: approver.email });

    const createRes = await request(app)
      .post("/api/claims")
      .set("Authorization", `Bearer ${claimant.token}`)
      .send({
        lineItems: [{ date: "2026-01-01", category: "MEALS", amount: 20, description: "Lunch" }],
      });
    expect(createRes.status).toBe(201);
    const claimId: string = createRes.body.claim.id;

    const today = localDate();
    const yesterday = localDate(-1);
    const tomorrow = localDate(1);

    expect(await queueIds(approver.token, { from: today, to: today })).toContain(claimId);
    expect(await queueIds(approver.token, { from: yesterday })).toContain(claimId);
    expect(await queueIds(approver.token, { to: tomorrow })).toContain(claimId);

    expect(await queueIds(approver.token, { from: tomorrow })).not.toContain(claimId);
    expect(await queueIds(approver.token, { to: yesterday })).not.toContain(claimId);

    const decideRes = await request(app)
      .post(`/api/approvals/${claimId}/decision`)
      .set("Authorization", `Bearer ${approver.token}`)
      .send({ action: "APPROVE" });
    expect(decideRes.status).toBe(200);

    expect(await queueIds(approver.token, {})).not.toContain(claimId);

    expect(await queueIds(approver.token, { decided: true, from: today, to: today })).toContain(
      claimId,
    );
    expect(await queueIds(approver.token, { decided: true, from: tomorrow })).not.toContain(
      claimId,
    );
    expect(await queueIds(approver.token, { decided: true, to: yesterday })).not.toContain(claimId);
  });
});
