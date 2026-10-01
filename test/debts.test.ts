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
    simplifiedDebt: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
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

describe("POST /events/:eventId/debts/:debtId/settle", () => {
  const eventId = "event-1";
  const debtId = "debt-1";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
  const participants = [
    {
      id: "participant-ana",
      eventId,
      userId: "user-ana",
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
      id: "participant-anonymous",
      eventId,
      userId: null,
      username: "invitado",
      isAnonymous: true,
      isOrganizer: false,
    },
  ];
  const event = {
    id: eventId,
    groupId: "group-1",
    organizerId: "user-ana",
    name: "Asado",
    location: "Casa de Ana",
    status: "active",
    startDateTime: null,
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    participants,
  };
  const pendingDebt = {
    id: debtId,
    eventId,
    amountCents: 1500,
    status: "pending" as const,
    settledAt: null,
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    debtor: { id: "participant-ana", username: "ana" },
    creditor: { id: "participant-beto", username: "beto" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockSuccessfulSettlement(
    debt = pendingDebt,
    allDebts = [
      {
        ...pendingDebt,
        status: "settled" as const,
        settledAt: new Date("2026-09-30T12:00:00.000Z"),
      },
    ],
  ) {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.simplifiedDebt.findUnique).mockResolvedValueOnce(debt as never);
    vi.mocked(prisma.simplifiedDebt.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(allDebts as never);
  }

  it("saldar una deuda pendiente devuelve la deuda pública y que era la última", async () => {
    mockSuccessfulSettlement();

    const response = await request(app)
      .post(`/events/${eventId}/debts/${debtId}/settle`)
      .set("Authorization", `Bearer ${tokenService.sign("user-ana")}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      debt: {
        id: debtId,
        eventId,
        debtor: { participantId: "participant-ana", username: "ana" },
        creditor: { participantId: "participant-beto", username: "beto" },
        amountCents: 1500,
        status: "settled",
      },
      allEventDebtsSettled: true,
    });
    expect(response.body.debt.settledAt).toEqual(expect.any(String));
    expect(response.body.debt.createdAt).toBeUndefined();
  });

  it("informa false cuando quedan otras deudas pendientes", async () => {
    mockSuccessfulSettlement(pendingDebt, [
      { ...pendingDebt, status: "settled" as const, settledAt: new Date() },
      { ...pendingDebt, id: "debt-2" },
    ]);

    const response = await request(app)
      .post(`/events/${eventId}/debts/${debtId}/settle`)
      .set("Authorization", `Bearer ${tokenService.sign("user-ana")}`);

    expect(response.status).toBe(200);
    expect(response.body.allEventDebtsSettled).toBe(false);
  });

  it("devuelve 409 si la deuda ya está saldada", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.simplifiedDebt.findUnique).mockResolvedValueOnce({
      ...pendingDebt,
      status: "settled",
      settledAt: new Date(),
    } as never);

    const response = await request(app)
      .post(`/events/${eventId}/debts/${debtId}/settle`)
      .set("Authorization", `Bearer ${tokenService.sign("user-ana")}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("DEBT_ALREADY_SETTLED");
  });

  it("prohíbe a un tercero aunque participe del evento", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.simplifiedDebt.findUnique).mockResolvedValueOnce({
      ...pendingDebt,
      debtor: { id: "participant-beto", username: "beto" },
      creditor: { id: "participant-anonymous", username: "invitado" },
    } as never);

    const response = await request(app)
      .post(`/events/${eventId}/debts/${debtId}/settle`)
      .set("Authorization", `Bearer ${tokenService.sign("user-ana")}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
  });

  it("oculta una deuda de otro evento", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.simplifiedDebt.findUnique).mockResolvedValueOnce({
      ...pendingDebt,
      eventId: "event-2",
    } as never);

    const response = await request(app)
      .post(`/events/${eventId}/debts/${debtId}/settle`)
      .set("Authorization", `Bearer ${tokenService.sign("user-ana")}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
  });

  it("rechaza eventos cancelados", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
      ...event,
      status: "cancelled",
    } as never);

    const response = await request(app)
      .post(`/events/${eventId}/debts/${debtId}/settle`)
      .set("Authorization", `Bearer ${tokenService.sign("user-ana")}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("EVENT_UNAVAILABLE");
  });

  it("permite saldar con una sesión anónima que representa al deudor", async () => {
    const anonymousDebt = {
      ...pendingDebt,
      debtor: { id: "participant-anonymous", username: "invitado" },
    };
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce(participants[2] as never);
    vi.mocked(prisma.event.findUnique)
      .mockResolvedValueOnce(event as never)
      .mockResolvedValueOnce(event as never);
    vi.mocked(prisma.simplifiedDebt.findUnique).mockResolvedValueOnce(anonymousDebt as never);
    vi.mocked(prisma.simplifiedDebt.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce([
      { ...anonymousDebt, status: "settled", settledAt: new Date() },
    ] as never);

    const response = await request(app)
      .post(`/events/${eventId}/debts/${debtId}/settle`)
      .set(
        "Authorization",
        `Bearer ${tokenService.signParticipant("participant-anonymous", eventId)}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.debt.status).toBe("settled");
  });

  it("requiere autenticación", async () => {
    const response = await request(app).post(`/events/${eventId}/debts/${debtId}/settle`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });
});
