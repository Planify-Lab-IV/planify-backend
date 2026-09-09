// Catchea excepciones de la peticion HTTP de un evento
import type { Request, Response, NextFunction } from "express";
import type { EventService } from "../services/event.service.js";
import { UnauthorizedError, ValidationError } from "../shared/errors/index.js";
import { validateCreateEventDTO } from "../validators/event/event.validator.js";
import { validateAttendanceResponseDTO } from "../validators/participant/attendance.validator.js";
import { toEventResponseDTO } from "../dtos/event/event.response.dto.js";
import { toParticipantResponseDTO } from "../dtos/participant/participant.response.dto.js";

export interface EventController {
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
  cancel(req: Request, res: Response, next: NextFunction): Promise<void>;
  answerAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createEventController(eventService: EventService): EventController {
  return {
    async answerAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const eventId = req.params.eventId;
        if (typeof eventId !== "string" || eventId.trim() === "") {
          throw new ValidationError("El eventId es requerido");
        }

        const actor = req.attendanceActor;
        if (!actor) {
          throw new UnauthorizedError("Usuario no autenticado");
        }

        const dto = validateAttendanceResponseDTO(req.body);
        const participant = await eventService.answerAttendance(eventId, actor, dto.state);
        res.status(200).json(toParticipantResponseDTO(participant));
      } catch (error) {
        next(error);
      }
    },

    async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = req.userId;
        if (!userId) {
          throw new UnauthorizedError("Usuario no autenticado");
        }

        const eventId = req.params.id;
        if (typeof eventId !== "string" || eventId.trim() === "") {
          throw new ValidationError("El eventId es requerido");
        }

        const event = await eventService.cancel(userId, eventId);
        res.status(200).json(toEventResponseDTO(event));
      } catch (error) {
        next(error);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const organizerId = req.userId;
        if (!organizerId) {
          throw new UnauthorizedError("Usuario no autenticado");
        }

        const dto = validateCreateEventDTO(req.body);
        const event = await eventService.createEvent(organizerId, dto);

        res.status(201).json(toEventResponseDTO(event));
      } catch (error) {
        next(error);
      }
    },
  };
}
