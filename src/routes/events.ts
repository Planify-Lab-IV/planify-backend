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
import { availabilityRepository } from "../repositories/availability.repository.js";
import { createAvailabilityService } from "../services/availability.service.js";
import { createAvailabilityController } from "../controllers/availability.controller.js";
import { expenseRepository } from "../repositories/expense.repository.js";
import { debtRepository } from "../repositories/debt.repository.js";
import { createDebtService } from "../services/debt.service.js";
import { createExpenseService } from "../services/expense.service.js";
import { createExpenseController } from "../controllers/expense.controller.js";
import { createDebtController } from "../controllers/debt.controller.js";

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

router.patch("/events/:eventId/confirm-schedule", requireAuth, (req, res, next) =>
  eventController.confirmSchedule(req, res, next),
);

router.put("/events/:eventId/participants/me/attendance", requireAttendanceAuth, (req, res, next) =>
  eventController.answerAttendance(req, res, next),
);

const availabilityService = createAvailabilityService(
  eventRepository,
  participantRepository,
  availabilityRepository,
);
const availabilityController = createAvailabilityController(availabilityService);

router.put("/events/:eventId/availability", requireAttendanceAuth, (req, res, next) =>
  availabilityController.save(req, res, next),
);

router.get("/events/:eventId/availability", requireAttendanceAuth, (req, res, next) =>
  availabilityController.load(req, res, next),
);

router.get("/events/:eventId/availability/heatmap", requireAuth, (req, res, next) =>
  availabilityController.heatmap(req, res, next),
);

const debtService = createDebtService(expenseRepository, debtRepository, eventRepository);
const debtController = createDebtController(debtService);
const expenseService = createExpenseService(
  expenseRepository,
  eventRepository,
  participantRepository,
  debtService,
);
const expenseController = createExpenseController(expenseService);

router.post("/events/:eventId/expenses", requireAttendanceAuth, (req, res, next) =>
  expenseController.create(req, res, next),
);

router.get("/events/:eventId/debts", requireAttendanceAuth, (req, res, next) =>
  debtController.listEventDebts(req, res, next),
);

const invitationsService = createInvitationsService(eventRepository, invitationRepository);
const invitationController = createInvitationController(invitationsService);

router.post("/events/:eventId/invitations", requireAuth, (req, res, next) =>
  invitationController.create(req, res, next),
);

router.get("/invitations/:token", (req, res, next) => invitationController.resolve(req, res, next));

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
