import type { NextFunction, Request, Response } from "express";
import type { AvailabilityService } from "../services/availability.service.js";
import {
  getAttendanceActor,
  getAuthenticatedUserId,
  getEventId,
} from "../shared/request.helpers.js";
import { validateAvailabilityRequestDTO } from "../validators/availability/availability.validator.js";

export interface AvailabilityController {
  save(req: Request, res: Response, next: NextFunction): Promise<void>;
  load(req: Request, res: Response, next: NextFunction): Promise<void>;
  heatmap(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createAvailabilityController(
  availabilityService: AvailabilityService,
): AvailabilityController {
  return {
    async save(req, res, next) {
      try {
        const eventId = getEventId(req);
        const actor = getAttendanceActor(req);
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
        const actor = getAttendanceActor(req);
        const slots = await availabilityService.load(eventId, actor);

        res.status(200).json({ slots });
      } catch (error) {
        next(error);
      }
    },

    async heatmap(req, res, next) {
      try {
        const eventId = getEventId(req);
        const userId = getAuthenticatedUserId(req);
        const heatmap = await availabilityService.heatmap(userId, eventId);

        res.status(200).json(heatmap);
      } catch (error) {
        next(error);
      }
    },
  };
}
