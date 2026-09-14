// Define y ensambla las rutas del módulo de autenticación con sus dependencias.

import { Router } from "express";
import { createAuthController } from "../controllers/auth.controller.js";
import { createAuthService } from "../services/auth.service.js";
import { userRepository } from "../repositories/user.repository.js";
import { createPasswordHasher } from "../infrastructure/security/password.hasher.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { env } from "../shared/config/env.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";

const router = Router();

// --> Inyección de dependencias
const passwordHasher = createPasswordHasher();
const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAuthenticatedUser = createAuthMiddleware(sessionTokenService);
const authService = createAuthService(userRepository, passwordHasher, sessionTokenService);
const authController = createAuthController(authService);

router.post("/auth/login", (req, res, next) => authController.login(req, res, next));
router.get("/auth/me", requireAuthenticatedUser, (req, res, next) =>
  authController.getCurrentUser(req, res, next),
);

export default router;
