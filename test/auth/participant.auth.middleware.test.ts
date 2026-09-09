// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../src/types/express.d.ts" />
import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Event, EventRepository } from "../../src/repositories/event.repository.js";
import type {
  Participant,
  ParticipantRepository,
} from "../../src/repositories/participant.repository.js";
import { createSessionTokenService } from "../../src/infrastructure/security/session.token.service.js";
import { createParticipantAuthMiddleware } from "../../src/shared/middlewares/participant.auth.middleware.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";

const TEST_SECRET = "test-secret-que-cumple-con-los-32-caracteres";

const participant: Participant = {
  id: "participant-1",
  eventId: "event-1",
  username: "Gil",
  isAnonymous: true,
};

function makeEvent(status: "active" | "cancelled"): Event {
  return {
    id: "event-1",
    groupId: "group-1",
    organizerId: "user-organizer",
    name: "Cumpleaños",
    location: "Casa de Ana",
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [],
  };
}

function makeParticipantRepository(foundParticipant: Participant | null): ParticipantRepository {
  return {
    findById: vi.fn(async () => foundParticipant),
    findByEventId: vi.fn(),
    findByEventIdAndUsername: vi.fn(),
    findAttendanceById: vi.fn(),
    createAnonymous: vi.fn(),
    updateAttendance: vi.fn(),
  };
}

function makeEventRepository(event: Event | null): EventRepository {
  return {
    findById: vi.fn(async () => event),
    createAtomic: vi.fn(),
    cancelAtomic: vi.fn(),
  };
}

function makeApp(foundParticipant: Participant | null, event: Event | null) {
  const app = express();
  const tokenService = createSessionTokenService(TEST_SECRET);
  const middleware = createParticipantAuthMiddleware(
    tokenService,
    makeParticipantRepository(foundParticipant),
    makeEventRepository(event),
  );

  app.get("/participant-protected", middleware, (req, res) => {
    res.status(200).json(req.participantSession);
  });
  app.use(errorHandler);

  return { app, tokenService };
}

describe("requireAuthenticatedParticipant", () => {
  it("acepta una sesión anónima de un evento activo", async () => {
    const { app, tokenService } = makeApp(participant, makeEvent("active"));
    const token = tokenService.signParticipant(participant.id, participant.eventId);

    const response = await request(app)
      .get("/participant-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ participantId: participant.id, eventId: participant.eventId });
  });

  it("rechaza una sesión cuyo evento fue cancelado", async () => {
    const { app, tokenService } = makeApp(participant, makeEvent("cancelled"));
    const token = tokenService.signParticipant(participant.id, participant.eventId);

    const response = await request(app)
      .get("/participant-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("rechaza un token cuyo participante pertenece a otro evento", async () => {
    const { app, tokenService } = makeApp(
      { ...participant, eventId: "event-2" },
      makeEvent("active"),
    );
    const token = tokenService.signParticipant(participant.id, participant.eventId);

    const response = await request(app)
      .get("/participant-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });
});
