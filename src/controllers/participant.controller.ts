import type { Request, Response, NextFunction } from "express";
import type { ParticipantService } from "../services/participant.service.js";
import { getEventId } from "../shared/request.helpers.js";
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
        const eventId = getEventId(req);

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
