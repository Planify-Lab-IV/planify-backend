import type { NextFunction, Request, Response } from "express";
import type { SessionTokenService } from "../../infrastructure/security/session.token.service.js";
import type { EventRepository } from "../../repositories/event.repository.js";
import type { ParticipantRepository } from "../../repositories/participant.repository.js";
import { UnauthorizedError } from "../errors/index.js";
import { validateAnonymousParticipantSession } from "../auth/anonymous.participant.session.validator.js";

// protege rutas que en el futuro sean exclusivas de participantes anonimos
// verifica que el jwt corresponda a "este" participante y evento, y siga vigente

export function createParticipantAuthMiddleware(
  sessionTokenService: SessionTokenService,
  participantRepository: ParticipantRepository,
  eventRepository: EventRepository,
) {
  return async function requireAuthenticatedParticipant(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      next(new UnauthorizedError("Token de participante ausente"));
      return;
    }

    try {
      const session = await validateAnonymousParticipantSession(
        authHeader.slice("Bearer ".length),
        sessionTokenService,
        participantRepository,
        eventRepository,
      );

      req.participantSession = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}
