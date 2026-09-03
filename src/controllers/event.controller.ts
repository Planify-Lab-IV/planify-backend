// Catchea excepciones de la peticion HTTP de un evento
import type { Request, Response, NextFunction } from "express";
import type { EventService } from "../services/event.service.js";
import { UnauthorizedError } from "../shared/errors/index.js";
import { validateCreateEventDTO } from "../validators/event.validator.js";
import { toEventResponseDTO } from "../dtos/event.response.dto.js";

export interface EventController {
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createEventController(eventService: EventService): EventController {
  return {
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
