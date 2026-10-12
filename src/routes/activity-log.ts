import { Router } from "express";
import { createActivityLogController } from "../controllers/activity-log.controller.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { activityLogRepository } from "../repositories/activity-log.repository.js";
import { eventRepository } from "../repositories/event.repository.js";
import { participantRepository } from "../repositories/participant.repository.js";
import { createActivityLogService } from "../services/activity-log.service.js";
import { env } from "../shared/config/env.js";
import { createAttendanceAuthMiddleware } from "../shared/middlewares/attendance.auth.middleware.js";

const router = Router();

const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAttendanceAuth = createAttendanceAuthMiddleware(
  sessionTokenService,
  participantRepository,
  eventRepository,
);
const activityLogService = createActivityLogService(
  activityLogRepository,
  eventRepository,
  participantRepository,
);
const activityLogController = createActivityLogController(activityLogService);

router.get("/events/:eventId/activity-log", requireAttendanceAuth, (req, res, next) =>
  activityLogController.list(req, res, next),
);

export default router;
