import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    eventParticipant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    activityLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
  });

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

  it("permite al mismo participante anónimo consultar el historial antes y después de confirmar", async () => {
    const anonymousParticipant = {
      ...participant,
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    };
    const anonymousToken = tokenService.signParticipant(anonymousParticipant.id, eventId);
    const scheduleConfirmedEntry = {
      id: "activity-schedule-confirmed",
      eventId,
      type: "schedule_confirmed",
      actorParticipantId: participant.id,
      payload: { startDateTime: "2026-01-02T20:00:00.000Z" },
      createdAt: new Date("2026-01-01T12:00:00Z"),
      actor: { id: participant.id, username: participant.username },
    };
    let currentEvent = event;
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValue(anonymousParticipant as never);
    vi.mocked(prisma.event.findUnique).mockImplementation((() => currentEvent) as never);
    vi.mocked(prisma.activityLog.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([scheduleConfirmedEntry] as never);

    const beforeConfirmation = await request(app)
      .get(`/events/${eventId}/activity-log`)
      .set("Authorization", `Bearer ${anonymousToken}`);
    currentEvent = { ...event, status: "confirmed" };
    const afterConfirmation = await request(app)
      .get(`/events/${eventId}/activity-log`)
      .set("Authorization", `Bearer ${anonymousToken}`);

    expect(beforeConfirmation.status).toBe(200);
    expect(beforeConfirmation.body).toEqual({ entries: [] });
    expect(afterConfirmation.status).toBe(200);
    expect(afterConfirmation.body).toEqual({
      entries: [
        {
          id: scheduleConfirmedEntry.id,
          type: scheduleConfirmedEntry.type,
          actor: { participantId: participant.id, username: participant.username },
          payload: scheduleConfirmedEntry.payload,
          createdAt: scheduleConfirmedEntry.createdAt.toJSON(),
        },
      ],
    });
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

describe("POST /events/:eventId/activity-log/read", () => {
  const eventId = "event-1";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
  });

  it("marca como leído el evento para un usuario registrado", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.eventParticipant.updateMany).mockResolvedValueOnce({ count: 1 } as never);

    const response = await request(app)
      .post(`/events/${eventId}/activity-log/read`)
      .set("Authorization", `Bearer ${tokenService.sign(participant.userId)}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(prisma.eventParticipant.updateMany).toHaveBeenCalledWith({
      where: {
        id: participant.id,
        OR: [{ lastReadAt: null }, { lastReadAt: { lt: expect.any(Date) } }],
      },
      data: { lastReadAt: expect.any(Date) },
    });
  });

  it("marca como leído el evento para un participante anónimo", async () => {
    const anonymousParticipant = {
      ...participant,
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    };
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValue(anonymousParticipant as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(event as never);
    vi.mocked(prisma.eventParticipant.updateMany).mockResolvedValueOnce({ count: 1 } as never);

    const response = await request(app)
      .post(`/events/${eventId}/activity-log/read`)
      .set(
        "Authorization",
        `Bearer ${tokenService.signParticipant(anonymousParticipant.id, eventId)}`,
      );

    expect(response.status).toBe(204);
    expect(prisma.eventParticipant.updateMany).toHaveBeenCalledWith({
      where: {
        id: anonymousParticipant.id,
        OR: [{ lastReadAt: null }, { lastReadAt: { lt: expect.any(Date) } }],
      },
      data: { lastReadAt: expect.any(Date) },
    });
  });

  it("devuelve 401 sin una sesión válida", async () => {
    const response = await request(app).post(`/events/${eventId}/activity-log/read`);

    expect(response.status).toBe(401);
    expect(prisma.eventParticipant.updateMany).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el usuario no participa del evento", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(null);

    const response = await request(app)
      .post(`/events/${eventId}/activity-log/read`)
      .set("Authorization", `Bearer ${tokenService.sign("user-outsider")}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
    expect(prisma.eventParticipant.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET /me/unread-counts", () => {
  const tokenService = createSessionTokenService(env.JWT_SECRET);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
  });

  it("devuelve conteos por evento y el acumulado por grupo, incluidos los ceros", async () => {
    vi.mocked(prisma.eventParticipant.findMany).mockResolvedValueOnce([
      {
        id: "participant-1",
        eventId: "event-1",
        lastReadAt: null,
        event: { groupId: "group-1" },
      },
      {
        id: "participant-2",
        eventId: "event-2",
        lastReadAt: new Date("2026-01-01T10:00:00Z"),
        event: { groupId: "group-2" },
      },
    ] as never);
    vi.mocked(prisma.activityLog.count)
      .mockResolvedValueOnce(3 as never)
      .mockResolvedValueOnce(0 as never);

    const response = await request(app)
      .get("/me/unread-counts")
      .set("Authorization", `Bearer ${tokenService.sign("user-1")}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      events: [
        { eventId: "event-1", groupId: "group-1", unreadCount: 3 },
        { eventId: "event-2", groupId: "group-2", unreadCount: 0 },
      ],
      groups: [
        { groupId: "group-1", unreadCount: 3 },
        { groupId: "group-2", unreadCount: 0 },
      ],
    });
    expect(prisma.activityLog.count).toHaveBeenCalledWith({
      where: {
        eventId: "event-1",
        actorParticipantId: { not: "participant-1" },
      },
    });
    expect(prisma.activityLog.count).toHaveBeenCalledWith({
      where: {
        eventId: "event-2",
        actorParticipantId: { not: "participant-2" },
        createdAt: { gt: new Date("2026-01-01T10:00:00Z") },
      },
    });
  });

  it("devuelve listas vacías para un usuario sin participaciones", async () => {
    vi.mocked(prisma.eventParticipant.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get("/me/unread-counts")
      .set("Authorization", `Bearer ${tokenService.sign("user-without-events")}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ events: [], groups: [] });
    expect(prisma.activityLog.count).not.toHaveBeenCalled();
  });

  it("devuelve 401 sin token", async () => {
    const response = await request(app).get("/me/unread-counts");

    expect(response.status).toBe(401);
    expect(prisma.eventParticipant.findMany).not.toHaveBeenCalled();
  });
});
