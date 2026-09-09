import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    group: { findUnique: vi.fn(), create: vi.fn() },
    groupMember: { findUnique: vi.fn() },
    event: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    eventParticipant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    invitation: { create: vi.fn(), findUnique: vi.fn() },
    availabilitySlot: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

describe("/events/:eventId/availability", () => {
  const eventId = "event-1";
  const participantId = "participant-1";
  const userId = "user-1";
  const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
  const userToken = sessionTokenService.sign(userId);
  const event = {
    id: eventId,
    groupId: "group-1",
    organizerId: "user-organizer",
    name: "Cumpleaños",
    location: "Casa de Ana",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    participants: [],
  };
  const participant = {
    id: participantId,
    eventId,
    userId,
    username: "Ana",
    isAnonymous: false,
    isOrganizer: false,
    attendanceState: "not_confirmed",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: unknown) => unknown) =>
      callback({
        availabilitySlot: {
          deleteMany: prisma.availabilitySlot.deleteMany,
          createMany: prisma.availabilitySlot.createMany,
        },
      })) as never);
    vi.mocked(prisma.availabilitySlot.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.availabilitySlot.createMany).mockResolvedValue({ count: 0 } as never);
  });

  it("guarda la grilla del usuario registrado y responde 204", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);

    const response = await request(app)
      .put(`/events/${eventId}/availability`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ slots: [{ weekDay: 0, hourBlock: 9 }] });

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(prisma.availabilitySlot.deleteMany).toHaveBeenCalledWith({
      where: { eventId, participantId },
    });
    expect(prisma.availabilitySlot.createMany).toHaveBeenCalledWith({
      data: [{ eventId, participantId, weekDay: 0, hourBlock: 9 }],
    });
  });

  it("guarda la grilla del participante anónimo de su propio evento", async () => {
    const anonymousParticipant = {
      ...participant,
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    };
    const anonymousToken = sessionTokenService.signParticipant(anonymousParticipant.id, eventId);
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValue(anonymousParticipant as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(event as never);

    const response = await request(app)
      .put(`/events/${eventId}/availability`)
      .set("Authorization", `Bearer ${anonymousToken}`)
      .send({ slots: [{ weekDay: 6, hourBlock: 23 }] });

    expect(response.status).toBe(204);
    expect(prisma.availabilitySlot.createMany).toHaveBeenCalledWith({
      data: [{ eventId, participantId: anonymousParticipant.id, weekDay: 6, hourBlock: 23 }],
    });
  });

  it("devuelve la última selección completa del usuario actual", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.availabilitySlot.findMany).mockResolvedValueOnce([
      { eventId, participantId, weekDay: 0, hourBlock: 9 },
      { eventId, participantId, weekDay: 4, hourBlock: 18 },
    ] as never);

    const response = await request(app)
      .get(`/events/${eventId}/availability`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      slots: [
        { weekDay: 0, hourBlock: 9 },
        { weekDay: 4, hourBlock: 18 },
      ],
    });
  });

  it.each([
    { slots: [{ weekDay: 7, hourBlock: 9 }] },
    { slots: [{ weekDay: 0, hourBlock: 9, extra: true }] },
  ])("devuelve 400 sin modificar slots para un body inválido: %o", async (body) => {
    const response = await request(app)
      .put(`/events/${eventId}/availability`)
      .set("Authorization", `Bearer ${userToken}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(prisma.availabilitySlot.deleteMany).not.toHaveBeenCalled();
    expect(prisma.availabilitySlot.createMany).not.toHaveBeenCalled();
  });

  it("devuelve 400 para un evento cancelado también con sesión anónima", async () => {
    const anonymousParticipant = {
      ...participant,
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    };
    const anonymousToken = sessionTokenService.signParticipant(anonymousParticipant.id, eventId);
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValue(anonymousParticipant as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      ...event,
      status: "cancelled",
    } as never);

    const response = await request(app)
      .put(`/events/${eventId}/availability`)
      .set("Authorization", `Bearer ${anonymousToken}`)
      .send({ slots: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(prisma.availabilitySlot.deleteMany).not.toHaveBeenCalled();
  });

  it("requiere una sesión válida", async () => {
    const response = await request(app).put(`/events/${eventId}/availability`).send({ slots: [] });

    expect(response.status).toBe(401);
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el usuario no participa del evento", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(null);

    const response = await request(app)
      .put(`/events/${eventId}/availability`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ slots: [] });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
    expect(prisma.availabilitySlot.deleteMany).not.toHaveBeenCalled();
  });
});
