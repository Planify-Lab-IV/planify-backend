// Define y ensambla las rutas del módulo de eventos con sus dependencias.

import { Router } from "express";
import { createEventController } from "../controllers/event.controller.js";
import { createEventService } from "../services/event.service.js";
import { eventRepository } from "../repositories/event.repository.js";
import { groupRepository } from "../repositories/group.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";
import { createAttendanceAuthMiddleware } from "../shared/middlewares/attendance.auth.middleware.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { createParticipantController } from "../controllers/participant.controller.js";
import { createParticipantService } from "../services/participant.service.js";
import { participantRepository } from "../repositories/participant.repository.js";
import { createPasswordHasher } from "../infrastructure/security/password.hasher.js";
import { env } from "../shared/config/env.js";
import { invitationRepository } from "../repositories/invitation.repository.js";
import { createInvitationsService } from "../services/invitations.service.js";
import { createInvitationController } from "../controllers/invitation.controller.js";

const router = Router();

// -_> Inyección de dependencias
const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAuth = createAuthMiddleware(sessionTokenService);
const requireAttendanceAuth = createAttendanceAuthMiddleware(
  sessionTokenService,
  participantRepository,
  eventRepository,
);

const eventService = createEventService(
  eventRepository,
  groupRepository,
  userRepository,
  participantRepository,
);
const eventController = createEventController(eventService);

router.post("/events", requireAuth, (req, res, next) => eventController.create(req, res, next));

router.get("/events/:eventId", requireAttendanceAuth, (req, res, next) =>
  eventController.getById(req, res, next),
);

router.put("/events/:id/cancel", requireAuth, (req, res, next) =>
  eventController.cancel(req, res, next),
);

router.put("/events/:eventId/participants/me/attendance", requireAttendanceAuth, (req, res, next) =>
  eventController.answerAttendance(req, res, next),
);

// INVITATIONS

const invitationsService = createInvitationsService(eventRepository, invitationRepository);
const invitationController = createInvitationController(invitationsService);

router.post("/events/:eventId/invitations", requireAuth, (req, res, next) =>
  invitationController.create(req, res, next),
);

router.get("/invitations/:token", (req, res, next) => invitationController.resolve(req, res, next));

// PARTICIPANT

const passwordHasher = createPasswordHasher();

const participantService = createParticipantService(
  eventRepository,
  participantRepository,
  passwordHasher,
  sessionTokenService,
);

const participantController = createParticipantController(participantService);

router.post("/events/:eventId/participants/anonymous", (req, res, next) =>
  participantController.enterAnonymous(req, res, next),
);

export default router;
