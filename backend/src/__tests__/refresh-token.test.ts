import request from "supertest";
import { app, registerUser } from "./test-helpers";
import { prisma } from "../lib/prisma";

async function loginWithRefresh() {
  const user = await registerUser("CLAIMANT");
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: user.email, password: "Str0ng!TestPass9" });
  expect(res.status).toBe(200);
  return { user, refreshToken: res.body.refreshToken as string };
}

describe("refresh token flow", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("issues a refresh token on login and register", async () => {
    const { refreshToken } = await loginWithRefresh();
    expect(refreshToken).toEqual(expect.any(String));
  });

  it("rotates the refresh token and returns a working access token", async () => {
    const { refreshToken } = await loginWithRefresh();

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(refreshToken);

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it("treats reuse of a rotated token as theft and revokes the whole chain", async () => {
    const { refreshToken } = await loginWithRefresh();

    const rotated = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(rotated.status).toBe(200);

    const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(reuse.status).toBe(401);

    const descendant = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: rotated.body.refreshToken });
    expect(descendant.status).toBe(401);
  });

  it("rejects unknown refresh tokens", async () => {
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: "nope" });
    expect(res.status).toBe(401);
  });

  it("rejects expired refresh tokens", async () => {
    const { user, refreshToken } = await loginWithRefresh();
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it("revokes the token on logout", async () => {
    const { refreshToken } = await loginWithRefresh();

    const out = await request(app).post("/api/auth/logout").send({ refreshToken });
    expect(out.status).toBe(204);

    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(401);
  });
});
