import { Router } from "express";
import { createActivityLogController } from "../controllers/activity-log.controller.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { activityLogRepository } from "../repositories/activity-log.repository.js";
import { eventRepository } from "../repositories/event.repository.js";
import { participantRepository } from "../repositories/participant.repository.js";
import { createActivityLogService } from "../services/activity-log.service.js";
import { env } from "../shared/config/env.js";
import { createAttendanceAuthMiddleware } from "../shared/middlewares/attendance.auth.middleware.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";
import { userRepository } from "../repositories/user.repository.js";

const router = Router();

const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAttendanceAuth = createAttendanceAuthMiddleware(
  sessionTokenService,
  participantRepository,
  eventRepository,
  userRepository,
);
const requireAuthenticatedUser = createAuthMiddleware(sessionTokenService, userRepository);
const activityLogService = createActivityLogService(
  activityLogRepository,
  eventRepository,
  participantRepository,
);
const activityLogController = createActivityLogController(activityLogService);

router.get("/events/:eventId/activity-log", requireAttendanceAuth, (req, res, next) =>
  activityLogController.list(req, res, next),
);

router.post("/events/:eventId/activity-log/read", requireAttendanceAuth, (req, res, next) =>
  activityLogController.markAsRead(req, res, next),
);

router.get("/me/unread-counts", requireAuthenticatedUser, (req, res, next) =>
  activityLogController.getUnreadCounts(req, res, next),
);

export default router;
