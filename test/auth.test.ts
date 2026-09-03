import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import bcrypt from "bcrypt";

vi.mock("../src/infrastructure/prisma.js", () => ({
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
