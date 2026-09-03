// Define y ensambla las rutas del módulo de eventos con sus dependencias.

import { Router } from "express";
import { createEventController } from "../controllers/event.controller.js";
import { createEventService } from "../services/event.service.js";
import { eventoRepository } from "../repositories/evento.repository.js";
import { grupoRepository } from "../repositories/grupo.repository.js";
import { usuarioRepository } from "../repositories/usuario.repository.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { env } from "../shared/config/env.js";

const router = Router();

// -_> Inyección de dependencias
const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAuth = createAuthMiddleware(sessionTokenService);

const eventService = createEventService(eventoRepository, grupoRepository, usuarioRepository);
const eventController = createEventController(eventService);

router.post("/events", requireAuth, (req, res, next) => eventController.create(req, res, next));

export default router;
