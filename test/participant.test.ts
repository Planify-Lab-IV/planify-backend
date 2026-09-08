import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";
import { participantRepository } from "../src/repositories/participant.repository.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    event: {
      findUnique: vi.fn(),
    },
    eventParticipant: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

describe("POST /events/:eventId/participants/anonymous", () => {
  const eventId = "event-1";
  const otherEventId = "event-2";
  const pin = "1234";

  const event = {
    id: eventId,
    groupId: "group-1",
    organizerId: "user-1",
    name: "Cumpleaños",
    location: "Casa de Ana",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [],
  };

  const createdParticipant = {
    id: "participant-1",
    eventId,
    username: "Gil",
    isAnonymous: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea un participante anónimo, guarda el PIN hasheado y emite una sesión", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);

    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce(null);

    vi.mocked(prisma.eventParticipant.create).mockResolvedValueOnce(createdParticipant as never);

    const response = await request(app).post(`/events/${eventId}/participants/anonymous`).send({
      name: "Gil",
      pin,
    });

    expect(response.status).toBe(201);

    expect(response.body).toEqual({
      participant: createdParticipant,
      token: expect.any(String),
    });

    expect(response.body).not.toHaveProperty("pin");
    expect(response.body).not.toHaveProperty("pinHash");
    expect(response.body.participant).not.toHaveProperty("pin");
    expect(response.body.participant).not.toHaveProperty("pinHash");

    expect(prisma.eventParticipant.findUnique).toHaveBeenCalledWith({
      where: {
        eventId_username: {
          eventId,
          username: "Gil",
        },
      },
      select: {
        id: true,
        eventId: true,
        username: true,
        isAnonymous: true,
        pinHash: true,
      },
    });

    expect(prisma.eventParticipant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId,
          username: "Gil",
          isAnonymous: true,
          isOrganizer: false,
          pinHash: expect.any(String),
        }),
      }),
    );

    const createCall = vi.mocked(prisma.eventParticipant.create).mock.calls[0]?.[0];

    const savedHash =
      createCall?.data && "pinHash" in createCall.data ? createCall.data.pinHash : undefined;

    if (typeof savedHash !== "string") {
      throw new Error("Se esperaba que el participante se creara con un pinHash");
    }

    expect(savedHash).not.toBe(pin);
    await expect(bcrypt.compare(pin, savedHash)).resolves.toBe(true);

    const tokenService = createSessionTokenService(env.JWT_SECRET);

    expect(tokenService.verifyParticipant(response.body.token)).toEqual({
      participantId: createdParticipant.id,
      eventId,
    });
  });

  it("reingresa con el mismo participante si nombre y PIN coinciden", async () => {
    const storedPinHash = bcrypt.hashSync(pin, 10);

    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);

    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce({
      ...createdParticipant,
      pinHash: storedPinHash,
    } as never);

    const response = await request(app).post(`/events/${eventId}/participants/anonymous`).send({
      name: "Gil",
      pin,
    });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      participant: createdParticipant,
      token: expect.any(String),
    });

    expect(prisma.eventParticipant.create).not.toHaveBeenCalled();

    const tokenService = createSessionTokenService(env.JWT_SECRET);

    expect(tokenService.verifyParticipant(response.body.token)).toEqual({
      participantId: createdParticipant.id,
      eventId,
    });
  });

  it("resuelve como reingreso si otro request crea el participante al mismo tiempo", async () => {
    const storedPinHash = bcrypt.hashSync(pin, 10);

    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...createdParticipant, pinHash: storedPinHash } as never);
    vi.mocked(prisma.eventParticipant.create).mockRejectedValueOnce({ code: "P2002" });

    const response = await request(app).post(`/events/${eventId}/participants/anonymous`).send({
      name: "Gil",
      pin,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      participant: createdParticipant,
      token: expect.any(String),
    });
    expect(prisma.eventParticipant.findUnique).toHaveBeenCalledTimes(2);
  });

  it("devuelve 401 cuando el participante existe pero el PIN no coincide", async () => {
    const storedPinHash = bcrypt.hashSync(pin, 10);

    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);

    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce({
      ...createdParticipant,
      pinHash: storedPinHash,
    } as never);

    const response = await request(app).post(`/events/${eventId}/participants/anonymous`).send({
      name: "Gil",
      pin: "9999",
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "UNAUTHORIZED",
      message: "Credenciales inválidas",
    });

    expect(prisma.eventParticipant.create).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el evento no existe", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(null);

    const response = await request(app)
      .post(`/events/event-inexistente/participants/anonymous`)
      .send({
        name: "Gil",
        pin,
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "NOT_FOUND",
      message: "Evento no encontrado",
    });

    expect(prisma.eventParticipant.findUnique).not.toHaveBeenCalled();
    expect(prisma.eventParticipant.create).not.toHaveBeenCalled();
  });

  it("rechaza el ingreso anónimo si el evento está cancelado", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
      ...event,
      status: "cancelled",
    } as never);

    const response = await request(app).post(`/events/${eventId}/participants/anonymous`).send({
      name: "Gil",
      pin,
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "EVENT_UNAVAILABLE",
      message: "El evento no está disponible",
    });
    expect(prisma.eventParticipant.findUnique).not.toHaveBeenCalled();
    expect(prisma.eventParticipant.create).not.toHaveBeenCalled();
  });

  it("permite el mismo nombre en eventos distintos", async () => {
    vi.mocked(prisma.event.findUnique)
      .mockResolvedValueOnce(event as never)
      .mockResolvedValueOnce({
        ...event,
        id: otherEventId,
      } as never);

    vi.mocked(prisma.eventParticipant.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    vi.mocked(prisma.eventParticipant.create)
      .mockResolvedValueOnce(createdParticipant as never)
      .mockResolvedValueOnce({
        ...createdParticipant,
        id: "participant-2",
        eventId: otherEventId,
      } as never);

    const firstResponse = await request(app)
      .post(`/events/${eventId}/participants/anonymous`)
      .send({
        name: "Gil",
        pin,
      });

    const secondResponse = await request(app)
      .post(`/events/${otherEventId}/participants/anonymous`)
      .send({
        name: "Gil",
        pin,
      });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    expect(prisma.eventParticipant.create).toHaveBeenCalledTimes(2);

    expect(prisma.eventParticipant.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          eventId,
          username: "Gil",
        }),
      }),
    );

    expect(prisma.eventParticipant.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: otherEventId,
          username: "Gil",
        }),
      }),
    );
  });

  it.each([
    [{ name: "", pin: "1234" }],
    [{ name: "Gil", pin: "123" }],
    [{ name: "Gil", pin: "12345" }],
    [{ name: "Gil", pin: 1234 }],
    [{ nombre: "Gil", pin: "1234" }],
    [{ name: "Gil", pin: "1234", extra: true }],
  ])("devuelve 400 ante body inválido: %o", async (body) => {
    const response = await request(app)
      .post(`/events/${eventId}/participants/anonymous`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");

    expect(prisma.event.findUnique).not.toHaveBeenCalled();
    expect(prisma.eventParticipant.findUnique).not.toHaveBeenCalled();
    expect(prisma.eventParticipant.create).not.toHaveBeenCalled();
  });
});

describe("ParticipantRepository.invalidateAnonymousSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("anula los PIN de todos los participantes anónimos del evento", async () => {
    vi.mocked(prisma.eventParticipant.updateMany).mockResolvedValueOnce({ count: 2 } as never);

    await participantRepository.invalidateAnonymousSessions("event-1");

    expect(prisma.eventParticipant.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: "event-1",
        isAnonymous: true,
      },
      data: {
        pinHash: null,
      },
    });
  });
});
