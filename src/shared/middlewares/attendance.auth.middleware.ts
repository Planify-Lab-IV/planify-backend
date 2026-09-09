import type { NextFunction, Request, Response } from "express";
import type { SessionTokenService } from "../../infrastructure/security/session.token.service.js";
import type { EventRepository } from "../../repositories/event.repository.js";
import type { ParticipantRepository } from "../../repositories/participant.repository.js";
import { UnauthorizedError } from "../errors/index.js";
import { validateAnonymousParticipantSession } from "../auth/anonymous.participant.session.validator.js";

// Admite los mecanismos de sesion existentes
export function createAttendanceAuthMiddleware(
  sessionTokenService: SessionTokenService,
  participantRepository: ParticipantRepository,
  eventRepository: EventRepository,
  options: AttendanceAuthOptions = {},
) {
  return async function requireAuthenticatedAttendanceActor(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      next(new UnauthorizedError("Token de autenticación ausente"));
      return;
    }

    const token = authHeader.slice("Bearer ".length);

    try {
      req.attendanceActor = { type: "user", userId: sessionTokenService.verify(token) };
      next();
      return;
    } catch {
      // Vacio para intentar un segundo tipo de sesion
    }

    try {
      const session = await validateAnonymousParticipantSession(
        token,
        sessionTokenService,
        participantRepository,
        eventRepository,
        { requireActiveEvent: options.requireActiveAnonymousEvent ?? true }, // --> Para los casos donde no se pasa este atributo, que sea true
      );
      req.attendanceActor = {
        type: "anonymousParticipant",
        participantId: session.participantId,
        eventId: session.eventId,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
