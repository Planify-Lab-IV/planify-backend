import type { NextFunction, Request, Response } from "express";
import type { SessionTokenService } from "../../infrastructure/security/session.token.service.js";
import type { EventRepository } from "../../repositories/event.repository.js";
import type { ParticipantRepository } from "../../repositories/participant.repository.js";
import type { UserRepository } from "../../repositories/user.repository.js";
import { UnauthorizedError } from "../errors/index.js";
import { validateAnonymousParticipantSession } from "../auth/anonymous.participant.session.validator.js";
import { validateUserSession } from "../auth/user.session.validator.js";

// Admite los mecanismos de sesion existentes
export function createAttendanceAuthMiddleware(
  sessionTokenService: SessionTokenService,
  participantRepository: ParticipantRepository,
  eventRepository: EventRepository,
  userRepository: UserRepository,
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

    let isUserToken = false;
    try {
      sessionTokenService.verify(token);
      isUserToken = true;
    } catch {
      // Un token de participante se valida en el segundo flujo.
    }

    if (isUserToken) {
      try {
        req.attendanceActor = {
          type: "user",
          userId: await validateUserSession(token, sessionTokenService, userRepository),
        };
        next();
      } catch (error) {
        next(error);
      }
      return;
    }

    try {
      const session = await validateAnonymousParticipantSession(
        token,
        sessionTokenService,
        participantRepository,
        eventRepository,
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
