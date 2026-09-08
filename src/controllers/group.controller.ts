import type { NextFunction, Request, Response } from "express";
import { toGroupResponseDTO } from "../dtos/group/group.response.dto.js";
import type { GroupService } from "../services/group.service.js";
import { UnauthorizedError } from "../shared/errors/index.js";

export interface GroupController {
  listMyGroups(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createGroupController(groupService: GroupService): GroupController {
  return {
    async listMyGroups(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = req.userId;

        if (!userId) {
          throw new UnauthorizedError("User is not authenticated");
        }

        const groups = await groupService.listMyGroups(userId);

        res.status(200).json(groups.map(toGroupResponseDTO));
      } catch (error) {
        next(error);
      }
    },
  };
}
