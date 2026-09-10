import type { NextFunction, Request, Response } from "express";
import type { AvailabilityService } from "../services/availability.service.js";
import { UnauthorizedError, ValidationError } from "../shared/errors/index.js";
import { validateAvailabilityRequestDTO } from "../validators/availability/availability.validator.js";

export interface AvailabilityController {
  save(req: Request, res: Response, next: NextFunction): Promise<void>;
  load(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createAvailabilityController(
  availabilityService: AvailabilityService,
): AvailabilityController {
  function getEventId(req: Request): string {
    const eventId = req.params.eventId;
    if (typeof eventId !== "string" || eventId.trim() === "") {
      throw new ValidationError("El eventId es requerido");
    }

    return eventId;
  }

  function getActor(req: Request) {
    if (!req.attendanceActor) {
      throw new UnauthorizedError("Usuario no autenticado");
    }

    return req.attendanceActor;
  }

  return {
    async save(req, res, next) {
      try {
        const eventId = getEventId(req);
        const actor = getActor(req);
        const dto = validateAvailabilityRequestDTO(req.body);

        await availabilityService.save(eventId, actor, dto.slots);
        res.sendStatus(204);
      } catch (error) {
        next(error);
      }
    },

    async load(req, res, next) {
      try {
        const eventId = getEventId(req);
        const actor = getActor(req);
        const slots = await availabilityService.load(eventId, actor);

        res.status(200).json({ slots });
      } catch (error) {
        next(error);
      }
    },
  };
}
