import type { NextFunction, Request, Response } from "express";
import type { SessionTokenService } from "../../infrastructure/security/session.token.service.js";
import { UnauthorizedError } from "../errors/index.js";

// Admite los mecanismos de sesion existentes
export type AttendanceActor =
  | { type: "user"; userId: string }
  | { type: "anonymousParticipant"; participantId: string; eventId: string };

export function createAttendanceAuthMiddleware(sessionTokenService: SessionTokenService) {
  return function requireAuthenticatedAttendanceActor(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
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
      const session = sessionTokenService.verifyParticipant(token);
      req.attendanceActor = {
        type: "anonymousParticipant",
        participantId: session.participantId,
        eventId: session.eventId,
      };
      next();
    } catch {
      next(new UnauthorizedError("Token inválido o expirado"));
    }
  };
}
