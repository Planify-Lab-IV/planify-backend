import { Router } from "express";
import { createNotificationController } from "../controllers/notification.controller.js";
import { createConfiguredPushNotifier } from "../infrastructure/notifications/firebase.push.notifier.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { eventRepository } from "../repositories/event.repository.js";
import { participantRepository } from "../repositories/participant.repository.js";
import { pushDeviceRepository } from "../repositories/push-device.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { createNotificationService } from "../services/notification.service.js";
import { env, getFirebaseServiceAccount } from "../shared/config/env.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";

const router = Router();
const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAuthenticatedUser = createAuthMiddleware(sessionTokenService, userRepository);
const notificationService = createNotificationService(
  pushDeviceRepository,
  createConfiguredPushNotifier(getFirebaseServiceAccount(env)),
  eventRepository,
  participantRepository,
);
const notificationController = createNotificationController(notificationService);

router.post("/notifications/register-device", requireAuthenticatedUser, (req, res, next) =>
  notificationController.registerDevice(req, res, next),
);
router.post("/notifications/unregister-device", requireAuthenticatedUser, (req, res, next) =>
  notificationController.unregisterDevice(req, res, next),
);

export default router;
