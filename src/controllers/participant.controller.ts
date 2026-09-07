import type { Request, Response, NextFunction } from "express";
import type { ParticipantService } from "../services/participant.service.js";
import { ValidationError } from "../shared/errors/index.js";
import { validateAnonymousParticipantDTO } from "../validators/participant/anonimous.participant.validator.js";

export interface ParticipantController {
  enterAnonymous(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createParticipantController(
  participantService: ParticipantService,
): ParticipantController {
  return {
    async enterAnonymous(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const eventId = req.params.eventId;

        if (typeof eventId !== "string" || eventId.trim() === "") {
          throw new ValidationError("El eventId es requerido");
        }

        const dto = validateAnonymousParticipantDTO(req.body);
        const result = await participantService.enterAnonymous(eventId, dto);

        res.status(result.created ? 201 : 200).json({
          participant: result.participant,
          token: result.token,
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
