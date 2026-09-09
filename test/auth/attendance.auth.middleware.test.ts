// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../src/types/express.d.ts" />
import { describe, expect, it, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createSessionTokenService } from "../../src/infrastructure/security/session.token.service.js";
import { createAttendanceAuthMiddleware } from "../../src/shared/middlewares/attendance.auth.middleware.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";
import type { Event, EventRepository } from "../../src/repositories/event.repository.js";
import type {
  Participant,
  ParticipantRepository,
} from "../../src/repositories/participant.repository.js";

const TEST_SECRET = "test-secret-que-cumple-con-los-32-caracteres";

const anonymousParticipant: Participant = {
  id: "participant-1",
  eventId: "event-1",
  username: "Gil",
  isAnonymous: true,
};

const activeEvent: Event = {
  id: "event-1",
  groupId: "group-1",
  organizerId: "user-organizer",
  name: "Cumpleaños",
  location: "Casa de Ana",
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
  participants: [],
};

function makeParticipantRepository(
  participant: Participant | null = anonymousParticipant,
): ParticipantRepository {
  return {
    findById: vi.fn(async () => participant),
    findByEventId: vi.fn(),
    findByEventIdAndUsername: vi.fn(),
    findAttendanceById: vi.fn(),
    createAnonymous: vi.fn(),
    updateAttendance: vi.fn(),
  };
}

function makeEventRepository(event: Event | null = activeEvent): EventRepository {
  return {
    findById: vi.fn(async () => event),
    createAtomic: vi.fn(),
    cancelAtomic: vi.fn(),
  };
}

function makeApp(
  participant: Participant | null = anonymousParticipant,
  event: Event | null = activeEvent,
) {
  const app = express();
  const participantRepository = makeParticipantRepository(participant);
  const eventRepository = makeEventRepository(event);
  app.get(
    "/attendance-protected",
    createAttendanceAuthMiddleware(
      createSessionTokenService(TEST_SECRET),
      participantRepository,
      eventRepository,
    ),
    (req, res) => res.status(200).json(req.attendanceActor),
  );
  app.use(errorHandler);
  return app;
}

describe("requireAuthenticatedAttendanceActor", () => {
  it("acepta un token de usuario", async () => {
    const token = createSessionTokenService(TEST_SECRET).sign("user-1");

    const response = await request(makeApp())
      .get("/attendance-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ type: "user", userId: "user-1" });
  });

  it("acepta un token de participante anónimo", async () => {
    const token = createSessionTokenService(TEST_SECRET).signParticipant(
      anonymousParticipant.id,
      anonymousParticipant.eventId,
    );

    const response = await request(makeApp())
      .get("/attendance-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      type: "anonymousParticipant",
      participantId: anonymousParticipant.id,
      eventId: anonymousParticipant.eventId,
    });
  });

  it("rechaza un token anónimo si el evento fue cancelado", async () => {
    const token = createSessionTokenService(TEST_SECRET).signParticipant(
      anonymousParticipant.id,
      anonymousParticipant.eventId,
    );
    const response = await request(
      makeApp(anonymousParticipant, { ...activeEvent, status: "cancelled" }),
    )
      .get("/attendance-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("rechaza un token anónimo si su participante ya no existe", async () => {
    const token = createSessionTokenService(TEST_SECRET).signParticipant(
      anonymousParticipant.id,
      anonymousParticipant.eventId,
    );
    const response = await request(makeApp(null))
      .get("/attendance-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it.each([
    undefined,
    "Basic token",
    "Bearer inválido",
    `Bearer ${jwt.sign({ sub: "actor", sessionType: "unknown" }, TEST_SECRET)}`,
  ])("rechaza una credencial no válida: %s", async (authorization) => {
    const requestBuilder = request(makeApp()).get("/attendance-protected");
    const response = authorization
      ? await requestBuilder.set("Authorization", authorization)
      : await requestBuilder;

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });
});
