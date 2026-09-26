import type { NextFunction, Request, Response } from "express";
import type { InvitationsService } from "../services/invitations.service.js";
import { ValidationError } from "../shared/errors/index.js";
import { getAuthenticatedUserId, getEventId } from "../shared/request.helpers.js";
import { validateCreateInvitationDTO } from "../validators/invitation/create.invitation.validator.js";

export interface InvitationController {
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
  resolve(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createInvitationController(
  invitationsService: InvitationsService,
): InvitationController {
  return {
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const requesterId = getAuthenticatedUserId(req);
        const eventId = getEventId(req);

        const dto = validateCreateInvitationDTO(req.body ?? {});
        const result = await invitationsService.createInvitation(requesterId, eventId, dto);

        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    },

    async resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const token = req.params.token;
        if (typeof token !== "string" || token.trim() === "") {
          throw new ValidationError("El token de invitación es requerido");
        }

        const result = await invitationsService.resolveInvitationToken(token);

        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  };
}
