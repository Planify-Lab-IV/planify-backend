import type { NextFunction, Request, Response } from "express";
import type { SessionTokenService } from "../../infrastructure/security/session.token.service.js";
import type { EventRepository } from "../../repositories/event.repository.js";
import type { ParticipantRepository } from "../../repositories/participant.repository.js";
import { UnauthorizedError } from "../errors/index.js";

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

    let session;
    try {
      session = sessionTokenService.verifyParticipant(authHeader.slice("Bearer ".length));
    } catch {
      next(new UnauthorizedError("Token de participante inválido o expirado"));
      return;
    }

    const participant = await participantRepository.findById(session.participantId);
    if (!participant || !participant.isAnonymous || participant.eventId !== session.eventId) {
      next(new UnauthorizedError("Sesión de participante inválida"));
      return;
    }

    const event = await eventRepository.findById(session.eventId);
    if (!event || event.status !== "active") {
      next(new UnauthorizedError("Sesión de participante inválida"));
      return;
    }

    req.participantSession = session;
    next();
  };
}
