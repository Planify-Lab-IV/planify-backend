import { Router } from "express";
import { createTaskController } from "../controllers/task.controller.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { eventRepository } from "../repositories/event.repository.js";
import { participantRepository } from "../repositories/participant.repository.js";
import { taskRepository } from "../repositories/task.repository.js";
import { createTaskService } from "../services/task.service.js";
import { env } from "../shared/config/env.js";
import { createAttendanceAuthMiddleware } from "../shared/middlewares/attendance.auth.middleware.js";

const router = Router();

const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAttendanceAuth = createAttendanceAuthMiddleware(
  sessionTokenService,
  participantRepository,
  eventRepository,
);
const taskService = createTaskService(taskRepository, eventRepository, participantRepository);
const taskController = createTaskController(taskService);

router.get("/events/:eventId/tasks", requireAttendanceAuth, (req, res, next) =>
  taskController.list(req, res, next),
);

router.post("/events/:eventId/tasks", requireAttendanceAuth, (req, res, next) =>
  taskController.create(req, res, next),
);

router.post("/tasks/:id/claim", requireAttendanceAuth, (req, res, next) =>
  taskController.claim(req, res, next),
);

router.post("/tasks/:id/assign", requireAttendanceAuth, (req, res, next) =>
  taskController.assignTo(req, res, next),
);

router.post("/tasks/:id/complete", requireAttendanceAuth, (req, res, next) =>
  taskController.complete(req, res, next),
);

export default router;
