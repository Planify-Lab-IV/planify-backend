import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../src/app.js";
import { prisma } from "../../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../../src/infrastructure/security/session.token.service.js";
import { env } from "../../src/shared/config/env.js";
import bcrypt from "bcrypt";

vi.mock("../../src/infrastructure/prisma.js", () => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

describe("POST /auth/login", () => {
  const password = "DevPass123!";
  const userInDatabase = {
    id: "uuid-organizer-1",
    name: "Dev One",
    username: "dev1",
    email: "dev1@planify.dev",
    passwordHash: bcrypt.hashSync(password, 10),
  };

  beforeEach(() => vi.clearAllMocks());

  it("authenticates by email and returns the public English user contract", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(userInDatabase as never);

    const response = await request(app).post("/auth/login").send({
      identifier: userInDatabase.email,
      password,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: userInDatabase.id,
        name: userInDatabase.name,
        username: userInDatabase.username,
        email: userInDatabase.email,
      },
      token: expect.any(String),
    });
    expect(response.body.user).not.toHaveProperty("passwordHash");
  });

  it("authenticates by username", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(userInDatabase as never);

    const response = await request(app).post("/auth/login").send({
      identifier: userInDatabase.username,
      password,
    });

    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe(userInDatabase.name);
  });

  it("returns UNAUTHORIZED for invalid credentials", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);

    const response = await request(app).post("/auth/login").send({
      identifier: "missing@planify.dev",
      password,
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });
});

describe("GET /auth/me", () => {
  const user = {
    id: "uuid-organizer-1",
    name: "Dev One",
    username: "dev1",
    email: "dev1@planify.dev",
  };
  const tokenService = createSessionTokenService(env.JWT_SECRET);

  beforeEach(() => vi.clearAllMocks());

  it("returns the current public user for a valid user session", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(user as never);

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${tokenService.sign(user.id)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user });
    expect(response.body).not.toHaveProperty("token");
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: user.id },
      select: { id: true, name: true, username: true, email: true },
    });
  });

  it("returns UNAUTHORIZED when the Authorization header is missing", async () => {
    const response = await request(app).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it.each([
    ["an invalid token", "invalid-token"],
    [
      "an expired token",
      jwt.sign({ sub: user.id, sessionType: "user" }, env.JWT_SECRET, { expiresIn: "-1s" }),
    ],
  ])("returns UNAUTHORIZED for %s", async (_description, token) => {
    const response = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("returns UNAUTHORIZED for a participant session", async () => {
    const participantToken = tokenService.signParticipant("participant-1", "event-1");
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${participantToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("returns UNAUTHORIZED when the user no longer exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${tokenService.sign(user.id)}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });
});
