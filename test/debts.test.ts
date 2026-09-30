import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    eventParticipant: { findUnique: vi.fn() },
    simplifiedDebt: { findMany: vi.fn() },
  },
}));

describe("GET /events/:eventId/debts", () => {
  const eventId = "event-1";
  const userId = "user-ana";
  const anonymousParticipantId = "participant-anonymous";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
  const event = {
    id: eventId,
    groupId: "group-1",
    organizerId: userId,
    name: "Asado",
    location: "Casa de Ana",
    status: "active",
    startDateTime: null,
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    participants: [
      {
        id: "participant-ana",
        eventId,
        userId,
        username: "ana",
        isAnonymous: false,
        isOrganizer: true,
      },
      {
        id: "participant-beto",
        eventId,
        userId: "user-beto",
        username: "beto",
        isAnonymous: false,
        isOrganizer: false,
      },
      {
        id: anonymousParticipantId,
        eventId,
        userId: null,
        username: "invitado",
        isAnonymous: true,
        isOrganizer: false,
      },
    ],
  };

  const debts = [
    {
      id: "debt-pending",
      eventId,
      amountCents: 1500,
      status: "pending" as const,
      settledAt: null,
      createdAt: new Date("2026-09-20T00:00:00.000Z"),
      debtor: { id: "participant-ana", username: "ana" },
      creditor: { id: "participant-beto", username: "beto" },
    },
    {
      id: "debt-settled",
      eventId,
      amountCents: 500,
      status: "settled" as const,
      settledAt: new Date("2026-09-21T00:00:00.000Z"),
      createdAt: new Date("2026-09-20T00:00:00.000Z"),
      debtor: { id: "participant-beto", username: "beto" },
      creditor: { id: "participant-ana", username: "ana" },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve todas las deudas del evento con su contrato público", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(debts as never);

    const response = await request(app)
      .get(`/events/${eventId}/debts`)
      .set("Authorization", `Bearer ${tokenService.sign(userId)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      debts: [
        {
          id: "debt-pending",
          eventId,
          debtor: { participantId: "participant-ana", username: "ana" },
          creditor: { participantId: "participant-beto", username: "beto" },
          amountCents: 1500,
          status: "pending",
          settledAt: null,
        },
        {
          id: "debt-settled",
          eventId,
          debtor: { participantId: "participant-beto", username: "beto" },
          creditor: { participantId: "participant-ana", username: "ana" },
          amountCents: 500,
          status: "settled",
          settledAt: "2026-09-21T00:00:00.000Z",
        },
      ],
      allSettled: false,
    });
    expect(JSON.stringify(response.body)).not.toContain("createdAt");
  });

  it("devuelve una lista vacía con allSettled false cuando no hay deudas", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get(`/events/${eventId}/debts`)
      .set("Authorization", `Bearer ${tokenService.sign(userId)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ debts: [], allSettled: false });
  });

  it("devuelve allSettled true si todas las deudas están saldadas", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce([debts[1]] as never);

    const response = await request(app)
      .get(`/events/${eventId}/debts`)
      .set("Authorization", `Bearer ${tokenService.sign(userId)}`);

    expect(response.status).toBe(200);
    expect(response.body.allSettled).toBe(true);
  });

  it("requiere autenticación", async () => {
    const response = await request(app).get(`/events/${eventId}/debts`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });

  it("prohíbe a un usuario que no participa del evento", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);

    const response = await request(app)
      .get(`/events/${eventId}/debts`)
      .set("Authorization", `Bearer ${tokenService.sign("user-outsider")}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
    expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
  });

  it("devuelve not found si el evento no existe", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(null);

    const response = await request(app)
      .get(`/events/event-inexistente/debts`)
      .set("Authorization", `Bearer ${tokenService.sign(userId)}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
    expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
  });

  it("permite consultar a un participante anónimo del mismo evento", async () => {
    const anonymousParticipant = event.participants[2];
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce(
      anonymousParticipant as never,
    );
    vi.mocked(prisma.event.findUnique)
      .mockResolvedValueOnce(event as never)
      .mockResolvedValueOnce(event as never);
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get(`/events/${eventId}/debts`)
      .set(
        "Authorization",
        `Bearer ${tokenService.signParticipant(anonymousParticipantId, eventId)}`,
      );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ debts: [], allSettled: false });
  });
});
