import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    simplifiedDebt: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /me/balance", () => {
  const userId = "user-ana";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
  const userToken = tokenService.sign(userId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve el resumen de deudas pendientes del usuario autenticado", async () => {
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce([
      {
        amountCents: 5000,
        status: "pending",
        eventId: "event-asado",
        debtor: {
          id: "participant-beto",
          userId: "user-beto",
          username: "beto",
          user: { name: "Beto" },
        },
        creditor: {
          id: "participant-ana-asado",
          userId,
          username: "ana",
          user: { name: "Ana" },
        },
        event: { name: "Asado" },
      },
      {
        amountCents: 2300,
        status: "pending",
        eventId: "event-cine",
        debtor: {
          id: "participant-ana-cine",
          userId,
          username: "ana",
          user: { name: "Ana" },
        },
        creditor: {
          id: "participant-cami",
          userId: "user-cami",
          username: "cami",
          user: { name: "Cami" },
        },
        event: { name: "Cine" },
      },
    ] as never);

    const response = await request(app)
      .get("/me/balance")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      owedToMeCents: 5000,
      iOweCents: 2300,
    });
  });

  it("devuelve 401 sin token", async () => {
    const response = await request(app).get("/me/balance");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
  });

  it("devuelve 401 con un token de participante anónimo", async () => {
    const anonymousToken = tokenService.signParticipant("participant-anonymous", "event-1");

    const response = await request(app)
      .get("/me/balance")
      .set("Authorization", `Bearer ${anonymousToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
  });
});
