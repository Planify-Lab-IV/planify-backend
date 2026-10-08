import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    eventParticipant: { findUnique: vi.fn(), findFirst: vi.fn() },
    activityLog: { create: vi.fn(), findMany: vi.fn() },
  },
}));

describe("GET /events/:eventId/activity-log", () => {
  const eventId = "event-1";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
  const token = tokenService.sign("user-1");
  const event = {
    id: eventId,
    groupId: "group-1",
    organizerId: "user-organizer",
    name: "Asado",
    location: "Casa de Ana",
    status: "active",
    startDateTime: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    participants: [],
  };
  const participant = {
    id: "participant-1",
    eventId,
    userId: "user-1",
    username: "Ana",
    isAnonymous: false,
    isOrganizer: false,
    attendanceState: "not_confirmed",
  };

  beforeEach(() => vi.clearAllMocks());

  it("devuelve las entradas más recientes primero con el actor", async () => {
    const newest = {
      id: "activity-2",
      eventId,
      type: "expense_created",
      actorParticipantId: participant.id,
      payload: { expenseId: "expense-1", description: "Cena", totalAmountCents: 4500 },
      createdAt: new Date("2026-01-01T11:00:00Z"),
      actor: { id: participant.id, username: participant.username },
    };
    const oldest = {
      ...newest,
      id: "activity-1",
      type: "task_created",
      payload: { taskId: "task-1", title: "Comprar carne" },
      createdAt: new Date("2026-01-01T10:00:00Z"),
    };
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.activityLog.findMany).mockResolvedValueOnce([newest, oldest] as never);

    const response = await request(app)
      .get(`/events/${eventId}/activity-log`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      entries: [
        {
          id: newest.id,
          type: newest.type,
          actor: { participantId: participant.id, username: participant.username },
          payload: newest.payload,
          createdAt: newest.createdAt.toJSON(),
        },
        {
          id: oldest.id,
          type: oldest.type,
          actor: { participantId: participant.id, username: participant.username },
          payload: oldest.payload,
          createdAt: oldest.createdAt.toJSON(),
        },
      ],
    });
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("devuelve una lista vacía para un evento sin actividad", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.activityLog.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get(`/events/${eventId}/activity-log`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ entries: [] });
  });

  it("permite listar a un participante anónimo de su evento", async () => {
    const anonymousParticipant = {
      ...participant,
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    };
    const anonymousToken = tokenService.signParticipant(anonymousParticipant.id, eventId);
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValue(anonymousParticipant as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(event as never);
    vi.mocked(prisma.activityLog.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get(`/events/${eventId}/activity-log`)
      .set("Authorization", `Bearer ${anonymousToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ entries: [] });
  });

  it("devuelve 401 sin una sesión válida", async () => {
    const response = await request(app).get(`/events/${eventId}/activity-log`);

    expect(response.status).toBe(401);
    expect(prisma.activityLog.findMany).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el usuario no participa del evento", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(null);

    const response = await request(app)
      .get(`/events/${eventId}/activity-log`)
      .set("Authorization", `Bearer ${tokenService.sign("user-outsider")}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
    expect(prisma.activityLog.findMany).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el evento no existe", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(null);

    const response = await request(app)
      .get("/events/event-unknown/activity-log")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
    expect(prisma.eventParticipant.findFirst).not.toHaveBeenCalled();
  });
});
