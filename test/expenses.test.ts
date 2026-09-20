import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    eventParticipant: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    expense: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("POST /events/:eventId/expenses", () => {
  const eventId = "event-1";
  const userId = "user-1";
  const token = createSessionTokenService(env.JWT_SECRET).sign(userId);
  const body = {
    description: "Cena",
    totalAmountCents: 4500,
    payers: [
      { participantId: "participant-ana", amountCents: 3000 },
      { participantId: "participant-beto", amountCents: 1500 },
    ],
    debtors: [
      { participantId: "participant-ana", amountCents: 1500 },
      { participantId: "participant-beto", amountCents: 1500 },
      { participantId: "participant-cami", amountCents: 1500 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea un gasto para un participante registrado", async () => {
    const participants = [
      { id: "participant-ana", eventId, username: "ana", isAnonymous: false },
      { id: "participant-beto", eventId, username: "beto", isAnonymous: false },
      { id: "participant-cami", eventId, username: "cami", isAnonymous: false },
    ];
    const createdAt = new Date("2026-09-20T00:00:00.000Z");
    const createdExpense = {
      id: "expense-1",
      eventId,
      description: body.description,
      totalAmountCents: body.totalAmountCents,
      createdByParticipantId: "participant-ana",
      createdAt,
      payers: body.payers.map((payer) => ({ ...payer, expenseId: "expense-1" })),
      debtors: body.debtors.map((debtor) => ({ ...debtor, expenseId: "expense-1" })),
    };

    vi.mocked(prisma.eventParticipant.findMany).mockResolvedValueOnce(participants as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce({
      ...participants[0],
      userId,
      isOrganizer: false,
      attendanceState: "not_confirmed",
    } as never);
    vi.mocked(prisma.expense.create).mockResolvedValueOnce(createdExpense as never);
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ expense: { create: prisma.expense.create } })) as never);

    const response = await request(app)
      .post(`/events/${eventId}/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      ...createdExpense,
      createdAt: createdAt.toJSON(),
      payers: body.payers,
      debtors: body.debtors,
    });
  });

  it("rechaza un body inválido antes de consultar persistencia", async () => {
    const response = await request(app)
      .post(`/events/${eventId}/expenses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...body, totalAmountCents: 0 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(prisma.eventParticipant.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it("requiere una credencial válida", async () => {
    const response = await request(app).post(`/events/${eventId}/expenses`).send(body);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.eventParticipant.findMany).not.toHaveBeenCalled();
  });
});
