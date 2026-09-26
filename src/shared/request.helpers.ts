import type { Request } from "express";
import type { AttendanceActor } from "./auth/attendance.actor.js";
import { UnauthorizedError, ValidationError } from "./errors/index.js";

export function getEventId(req: Request): string {
  const eventId = req.params.eventId;
  if (typeof eventId !== "string" || eventId.trim() === "") {
    throw new ValidationError("El eventId es requerido");
  }

  return eventId;
}

export function getAttendanceActor(req: Request): AttendanceActor {
  if (!req.attendanceActor) {
    throw new UnauthorizedError("Usuario no autenticado");
  }

  return req.attendanceActor;
}

export function getAuthenticatedUserId(req: Request): string {
  if (!req.userId) {
    throw new UnauthorizedError("Usuario no autenticado");
  }

  return req.userId;
}
