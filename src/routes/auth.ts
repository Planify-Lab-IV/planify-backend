// Define y ensambla las rutas del módulo de autenticación con sus dependencias.

import { Router } from "express";
import { createAuthController } from "../controllers/auth.controller.js";
import { createAuthService } from "../services/auth.service.js";
import { userRepository } from "../repositories/user.repository.js";
import { participantRepository } from "../repositories/participant.repository.js";
import { createPasswordHasher } from "../infrastructure/security/password.hasher.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { env } from "../shared/config/env.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";
import { createPasswordResetController } from "../controllers/password-reset.controller.js";
import { passwordResetCodeRepository } from "../repositories/password-reset-code.repository.js";
import { createPasswordResetNotifier } from "../infrastructure/notifications/password-reset-notifier.factory.js";
import { createPasswordResetService } from "../services/password-reset.service.js";

const router = Router();

// --> Inyección de dependencias
const passwordHasher = createPasswordHasher();
const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAuthenticatedUser = createAuthMiddleware(sessionTokenService, userRepository);
const authService = createAuthService(
  userRepository,
  participantRepository,
  passwordHasher,
  sessionTokenService,
);
const authController = createAuthController(authService);
const passwordResetService = createPasswordResetService(
  userRepository,
  passwordResetCodeRepository,
  passwordHasher,
  createPasswordResetNotifier(env),
  () => new Date(),
);
const passwordResetController = createPasswordResetController(passwordResetService);

router.post("/auth/login", (req, res, next) => authController.login(req, res, next));
router.post("/auth/register", (req, res, next) => authController.register(req, res, next));
router.post("/auth/forgot-password", (req, res, next) =>
  passwordResetController.forgotPassword(req, res, next),
);
router.post("/auth/reset-password", (req, res, next) =>
  passwordResetController.resetPassword(req, res, next),
);
router.get("/auth/me", requireAuthenticatedUser, (req, res, next) =>
  authController.getCurrentUser(req, res, next),
);

export default router;
