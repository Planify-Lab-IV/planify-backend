// Define y ensambla las rutas del módulo de autenticación con sus dependencias.

import { Router } from "express";
import { createAuthController } from "../controllers/auth.controller.js";
import { createAuthService } from "../services/auth.service.js";
import { usuarioRepository } from "../repositories/usuario.repository.js";
import { createPasswordHasher } from "../infrastructure/security/password.hasher.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { env } from "../shared/config/env.js";

const router = Router();

// --> Inyección de dependencias
const passwordHasher = createPasswordHasher();
const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const authService = createAuthService(usuarioRepository, passwordHasher, sessionTokenService);
const authController = createAuthController(authService);

router.post("/auth/login", (req, res, next) => authController.login(req, res, next));

export default router;
