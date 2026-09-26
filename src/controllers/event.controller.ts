// Catchea excepciones de la peticion HTTP de un evento
import type { Request, Response, NextFunction } from "express";
import type { EventService } from "../services/event.service.js";
import {
  getAttendanceActor,
  getAuthenticatedUserId,
  getEventId,
} from "../shared/request.helpers.js";
import {
  validateConfirmScheduleDTO,
  validateCreateEventDTO,
} from "../validators/event/event.validator.js";
import { validateAttendanceResponseDTO } from "../validators/participant/attendance.validator.js";
import { toEventResponseDTO } from "../dtos/event/event.response.dto.js";
import { toParticipantResponseDTO } from "../dtos/participant/participant.response.dto.js";

export interface EventController {
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
  cancel(req: Request, res: Response, next: NextFunction): Promise<void>;
  confirmSchedule(req: Request, res: Response, next: NextFunction): Promise<void>;
  answerAttendance(req: Request, res: Response, next: NextFunction): Promise<void>;
  getById(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createEventController(eventService: EventService): EventController {
  return {
    async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const eventId = getEventId(req);
        const actor = getAttendanceActor(req);

        const event = await eventService.getById(eventId, actor);
        res.status(200).json(toEventResponseDTO(event));
      } catch (error) {
        next(error);
      }
    },

    async answerAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const eventId = getEventId(req);
        const actor = getAttendanceActor(req);

        const dto = validateAttendanceResponseDTO(req.body);
        const participant = await eventService.answerAttendance(eventId, actor, dto.state);
        res.status(200).json(toParticipantResponseDTO(participant));
      } catch (error) {
        next(error);
      }
    },

    async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = getAuthenticatedUserId(req);
        const eventId = getEventId(req);

        const event = await eventService.cancel(userId, eventId);
        res.status(200).json(toEventResponseDTO(event));
      } catch (error) {
        next(error);
      }
    },

    async confirmSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = getAuthenticatedUserId(req);
        const eventId = getEventId(req);

        const dto = validateConfirmScheduleDTO(req.body);
        const event = await eventService.confirmSchedule(
          userId,
          eventId,
          new Date(dto.startDateTime),
        );

        res.status(200).json(toEventResponseDTO(event));
      } catch (error) {
        next(error);
      }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const organizerId = getAuthenticatedUserId(req);

        const dto = validateCreateEventDTO(req.body);
        const event = await eventService.createEvent(organizerId, dto);

        res.status(201).json(toEventResponseDTO(event));
      } catch (error) {
        next(error);
      }
    },
  };
}
