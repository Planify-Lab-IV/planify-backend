import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";
import { eventRepository } from "../src/repositories/event.repository.js";

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
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

describe("POST /events", () => {
  const organizerId = "user-organizer-1";
  const validToken = createSessionTokenService(env.JWT_SECRET).sign(organizerId);
  const organizer = {
    id: organizerId,
    name: "Organizer",
    username: "organizer",
    email: "organizer@test.com",
  };

  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    const response = await request(app).post("/events").send({
      name: "Birthday",
      location: "Ana's house",
      newGroupName: "Friends",
    });
    expect(response.status).toBe(401);
  });

  it.each([
    { name: "Event", location: "", groupId: "group-1" },
    { name: "Event", location: "Place", groupId: 123 },
    { name: "Event", location: "Place", newGroupName: 123 },
    { name: "Event", location: "Place", newGroupName: "Group", memberIdentifiers: "ana" },
    { nombre: "Event", location: "Place", newGroupName: "Group" },
  ])("rejects an invalid event body: %o", async (payload) => {
    const response = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
  });

  it("returns the public EventResponseDTO for an existing group", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(organizer as never);
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Test group",
      members: [{ userId: organizerId, groupId: "group-1", user: organizer }],
    } as never);

    const createdEvent = {
      id: "event-1",
      name: "Birthday",
      location: "Ana's house",
      groupId: "group-1",
      organizerId,
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      participants: [
        {
          id: "participant-1",
          eventId: "event-1",
          userId: organizerId,
          username: "organizer",
          isOrganizer: true,
          isAnonymous: false,
        },
      ],
    };
    const createEvent = vi.fn().mockResolvedValue(createdEvent);
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ event: { create: createEvent } })) as never);

    const response = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ name: "Birthday", location: "Ana's house", groupId: "group-1" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: "event-1",
      name: "Birthday",
      location: "Ana's house",
      groupId: "group-1",
      organizerId,
      status: "active",
      participants: [
        {
          eventId: "event-1",
          userId: organizerId,
          username: "organizer",
          isAnonymous: false,
          isOrganizer: true,
        },
      ],
    });
    expect(response.body).not.toHaveProperty("nombre");
    expect(response.body.participants[0]).not.toHaveProperty("esOrganizador");
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Birthday", location: "Ana's house", organizerId }),
      }),
    );
  });

  it("resolves new group members by username or email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(organizer as never);
    const member = { id: "user-ana", name: "Ana", username: "ana", email: "ana@example.com" };
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(member as never);
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        group: { create: vi.fn().mockResolvedValue({ id: "group-new" }) },
        event: {
          create: vi.fn().mockResolvedValue({
            id: "event-new",
            name: "Party",
            location: "Club",
            groupId: "group-new",
            organizerId,
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
            participants: [],
          }),
        },
      })) as never);

    const response = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        name: "Party",
        location: "Club",
        newGroupName: "Friends",
        memberIdentifiers: ["ana"],
      });

    expect(response.status).toBe(201);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ email: "ana" }, { username: "ana" }] } }),
    );
  });
});

describe("GET /events/:eventId", () => {
  const eventId = "event-detail-1";
  const organizerId = "user-organizer";
  const memberId = "user-member";
  const anonymousParticipantId = "participant-anonymous";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
  const event = {
    id: eventId,
    groupId: "group-1",
    organizerId,
    name: "Cumpleaños",
    location: "Casa de Ana",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    participants: [
      {
        id: "participant-organizer",
        eventId,
        userId: organizerId,
        username: "organizer",
        isAnonymous: false,
        isOrganizer: true,
      },
      {
        id: "participant-member",
        eventId,
        userId: memberId,
        username: "member",
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
        pinHash: "hash-secreto",
      },
    ],
  };

  beforeEach(() => vi.clearAllMocks());

  it("permite al organizador registrado obtener el detalle público", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);

    const response = await request(app)
      .get(`/events/${eventId}`)
      .set("Authorization", `Bearer ${tokenService.sign(organizerId)}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: eventId,
      groupId: "group-1",
      organizerId,
      name: "Cumpleaños",
      location: "Casa de Ana",
      status: "active",
    });
    expect(response.body.participants).toHaveLength(3);
    expect(response.body.participants[0]).not.toHaveProperty("id");
    expect(response.body.participants[2]).not.toHaveProperty("pinHash");
    expect(JSON.stringify(response.body)).not.toContain("hash-secreto");
  });

  it("permite a un participante registrado obtener el detalle", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);

    const response = await request(app)
      .get(`/events/${eventId}`)
      .set("Authorization", `Bearer ${tokenService.sign(memberId)}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("active");
  });

  it("permite a un participante anónimo del mismo evento obtener el detalle", async () => {
    const anonymousParticipant = event.participants[2];
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce(
      anonymousParticipant as never,
    );
    vi.mocked(prisma.event.findUnique)
      .mockResolvedValueOnce(event as never)
      .mockResolvedValueOnce(event as never);

    const response = await request(app)
      .get(`/events/${eventId}`)
      .set(
        "Authorization",
        `Bearer ${tokenService.signParticipant(anonymousParticipantId, eventId)}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(eventId);
  });

  it("devuelve 404 si el evento no existe", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(null);

    const response = await request(app)
      .get("/events/event-inexistente")
      .set("Authorization", `Bearer ${tokenService.sign(organizerId)}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
  });

  it("devuelve 403 si el usuario registrado no participa", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);

    const response = await request(app)
      .get(`/events/${eventId}`)
      .set("Authorization", `Bearer ${tokenService.sign("user-outsider")}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
    expect(response.body).not.toHaveProperty("name");
    expect(response.body).not.toHaveProperty("participants");
  });

  it("devuelve 403 si el token anónimo pertenece a otro evento", async () => {
    const otherEventId = "event-other";
    const otherAnonymousParticipant = {
      ...event.participants[2],
      eventId: otherEventId,
    };
    const otherEvent = {
      ...event,
      id: otherEventId,
      participants: [otherAnonymousParticipant],
    };
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce(
      otherAnonymousParticipant as never,
    );
    vi.mocked(prisma.event.findUnique)
      .mockResolvedValueOnce(otherEvent as never)
      .mockResolvedValueOnce(event as never);

    const response = await request(app)
      .get(`/events/${eventId}`)
      .set(
        "Authorization",
        `Bearer ${tokenService.signParticipant(anonymousParticipantId, otherEventId)}`,
      );

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
    expect(response.body).not.toHaveProperty("participants");
  });

  it("permite a un participante registrado consultar un evento cancelado", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
      ...event,
      status: "cancelled",
    } as never);

    const response = await request(app)
      .get(`/events/${eventId}`)
      .set("Authorization", `Bearer ${tokenService.sign(organizerId)}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("cancelled");
  });

  it("rechaza la sesión anónima invalidada por la cancelación", async () => {
    const anonymousParticipant = event.participants[2];
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce(
      anonymousParticipant as never,
    );
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
      ...event,
      status: "cancelled",
    } as never);

    const response = await request(app)
      .get(`/events/${eventId}`)
      .set(
        "Authorization",
        `Bearer ${tokenService.signParticipant(anonymousParticipantId, eventId)}`,
      );

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });
});

describe("EventRepository.cancelAtomic", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancela el evento e invalida las credenciales anónimas en una transacción", async () => {
    const cancelledEvent = {
      id: "event-1",
      name: "Birthday",
      location: "Ana's house",
      groupId: "group-1",
      organizerId: "user-organizer-1",
      status: "cancelled",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      participants: [],
    };
    const updateEvent = vi.fn().mockResolvedValue(cancelledEvent);
    const invalidateSessions = vi.fn().mockResolvedValue({ count: 2 });

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        event: { update: updateEvent },
        eventParticipant: { updateMany: invalidateSessions },
      })) as never);

    await expect(eventRepository.cancelAtomic("event-1")).resolves.toMatchObject({
      id: "event-1",
      status: "cancelled",
    });

    expect(updateEvent).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: { status: "cancelled" },
      include: { participants: true },
    });
    expect(invalidateSessions).toHaveBeenCalledWith({
      where: { eventId: "event-1", isAnonymous: true },
      data: { pinHash: null },
    });
  });
});

describe("PUT /events/:id/cancel", () => {
  const organizerId = "user-organizer-1";
  const organizerToken = createSessionTokenService(env.JWT_SECRET).sign(organizerId);
  const event = {
    id: "event-1",
    name: "Birthday",
    location: "Ana's house",
    groupId: "group-1",
    organizerId,
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    participants: [
      {
        id: "participant-organizer",
        eventId: "event-1",
        userId: organizerId,
        username: "organizer",
        isAnonymous: false,
        isOrganizer: true,
      },
    ],
  };

  beforeEach(() => vi.clearAllMocks());

  it("requiere autenticación", async () => {
    const response = await request(app).put(`/events/${event.id}/cancel`);

    expect(response.status).toBe(401);
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });

  it("permite al organizador cancelar y devuelve el evento actualizado", async () => {
    const cancelledEvent = { ...event, status: "cancelled" };
    const updateEvent = vi.fn().mockResolvedValue(cancelledEvent);
    const invalidateSessions = vi.fn().mockResolvedValue({ count: 1 });
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        event: { update: updateEvent },
        eventParticipant: { updateMany: invalidateSessions },
      })) as never);

    const response = await request(app)
      .put(`/events/${event.id}/cancel`)
      .set("Authorization", `Bearer ${organizerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: event.id, status: "cancelled" });
    expect(invalidateSessions).toHaveBeenCalledWith({
      where: { eventId: event.id, isAnonymous: true },
      data: { pinHash: null },
    });
  });

  it("devuelve 403 si quien llama no es el participante organizador", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
      ...event,
      participants: [
        {
          ...event.participants[0],
          userId: "user-member",
          isOrganizer: false,
        },
      ],
    } as never);

    const response = await request(app)
      .put(`/events/${event.id}/cancel`)
      .set("Authorization", `Bearer ${organizerToken}`);

    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el evento no existe", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(null);

    const response = await request(app)
      .put("/events/event-inexistente/cancel")
      .set("Authorization", `Bearer ${organizerToken}`);

    expect(response.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("PUT /events/:eventId/participants/me/attendance", () => {
  const eventId = "event-1";
  const participantId = "participant-1";
  const userId = "user-1";
  const userToken = createSessionTokenService(env.JWT_SECRET).sign(userId);
  const event = {
    id: eventId,
    groupId: "group-1",
    organizerId: userId,
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
    username: "Gil",
    isAnonymous: false,
    isOrganizer: false,
    attendanceState: "not_confirmed",
  };

  beforeEach(() => vi.clearAllMocks());

  it("permite a un usuario confirmar su propia asistencia", async () => {
    const updatedParticipant = { ...participant, attendanceState: "confirmed" };
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.eventParticipant.update).mockResolvedValueOnce(updatedParticipant as never);

    const response = await request(app)
      .put(`/events/${eventId}/participants/me/attendance`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ state: "confirmed" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: participantId,
      eventId,
      username: "Gil",
      isAnonymous: false,
      isOrganizer: false,
      attendanceState: "confirmed",
    });
    expect(prisma.eventParticipant.update).toHaveBeenCalledWith({
      where: { id: participantId },
      data: { attendanceState: "confirmed" },
      select: expect.any(Object),
    });
  });

  it("permite a un participante anónimo rechazar su propia asistencia", async () => {
    const anonymousParticipant = {
      ...participant,
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    };
    const anonymousToken = createSessionTokenService(env.JWT_SECRET).signParticipant(
      anonymousParticipant.id,
      eventId,
    );
    vi.mocked(prisma.event.findUnique).mockResolvedValue(event as never);
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValue(anonymousParticipant as never);
    vi.mocked(prisma.eventParticipant.update).mockResolvedValueOnce({
      ...anonymousParticipant,
      attendanceState: "rejected",
    } as never);

    const response = await request(app)
      .put(`/events/${eventId}/participants/me/attendance`)
      .set("Authorization", `Bearer ${anonymousToken}`)
      .send({ state: "rejected" });

    expect(response.status).toBe(200);
    expect(response.body.attendanceState).toBe("rejected");
  });

  it("devuelve 401 si el token anónimo corresponde a un evento cancelado", async () => {
    const anonymousParticipant = {
      ...participant,
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    };
    const anonymousToken = createSessionTokenService(env.JWT_SECRET).signParticipant(
      anonymousParticipant.id,
      eventId,
    );
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce(
      anonymousParticipant as never,
    );
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
      ...event,
      status: "cancelled",
    } as never);

    const response = await request(app)
      .put(`/events/${eventId}/participants/me/attendance`)
      .set("Authorization", `Bearer ${anonymousToken}`)
      .send({ state: "confirmed" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.eventParticipant.update).not.toHaveBeenCalled();
  });

  it.each([
    { state: "not_confirmed" },
    { state: "maybe" },
    {},
    { state: "confirmed", extra: true },
  ])("devuelve 400 para un body inválido: %o", async (body) => {
    const response = await request(app)
      .put(`/events/${eventId}/participants/me/attendance`)
      .set("Authorization", `Bearer ${userToken}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
    expect(prisma.eventParticipant.update).not.toHaveBeenCalled();
  });

  it("requiere autenticación", async () => {
    const response = await request(app)
      .put(`/events/${eventId}/participants/me/attendance`)
      .send({ state: "confirmed" });

    expect(response.status).toBe(401);
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });

  it("no expone una ruta que acepte participantId", async () => {
    const response = await request(app)
      .put(`/events/${eventId}/participants/participant-other/attendance`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ state: "confirmed" });

    expect(response.status).toBe(404);
    expect(prisma.eventParticipant.update).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el usuario no participa del evento", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(null);

    const response = await request(app)
      .put(`/events/${eventId}/participants/me/attendance`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ state: "confirmed" });

    expect(response.status).toBe(404);
    expect(prisma.eventParticipant.update).not.toHaveBeenCalled();
  });

  it("devuelve 404 si otro usuario no participa del evento", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(null);
    const otherUserToken = createSessionTokenService(env.JWT_SECRET).sign("user-2");

    const response = await request(app)
      .put(`/events/${eventId}/participants/me/attendance`)
      .set("Authorization", `Bearer ${otherUserToken}`)
      .send({ state: "confirmed" });

    expect(response.status).toBe(404);
    expect(prisma.eventParticipant.update).not.toHaveBeenCalled();
  });

  it("devuelve 409 si el evento está cancelado", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
      ...event,
      status: "cancelled",
    } as never);

    const response = await request(app)
      .put(`/events/${eventId}/participants/me/attendance`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ state: "confirmed" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("EVENT_UNAVAILABLE");
    expect(prisma.eventParticipant.findUnique).not.toHaveBeenCalled();
  });
});
