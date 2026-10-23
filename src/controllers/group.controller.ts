import type { NextFunction, Request, Response } from "express";
import { toGroupOverviewResponseDTO } from "../dtos/group/group-overview.response.dto.js";
import { toGroupResponseDTO } from "../dtos/group/group.response.dto.js";
import type { GroupService } from "../services/group.service.js";
import { UnauthorizedError, ValidationError } from "../shared/errors/index.js";
import { validateRenameGroupDTO } from "../validators/group/rename.group.validator.js";

export interface GroupController {
  listMyGroups(req: Request, res: Response, next: NextFunction): Promise<void>;
  listMyGroupsOverview(req: Request, res: Response, next: NextFunction): Promise<void>;
  leaveGroup(req: Request, res: Response, next: NextFunction): Promise<void>;
  renameGroup(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createGroupController(groupService: GroupService): GroupController {
  function getGroupId(req: Request): string {
    const groupId = req.params.groupId;
    if (typeof groupId !== "string" || groupId.trim() === "") {
      throw new ValidationError("El id del grupo es requerido");
    }

    return groupId;
  }

  function getUserId(req: Request): string {
    const userId = req.userId;
    if (!userId) {
      throw new UnauthorizedError("User is not authenticated");
    }

    return userId;
  }

  return {
    async listMyGroups(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = getUserId(req);
        const groups = await groupService.listMyGroups(userId);

        res.status(200).json(groups.map(toGroupResponseDTO));
      } catch (error) {
        next(error);
      }
    },

    async listMyGroupsOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = getUserId(req);
        const groups = await groupService.listMyGroupsOverview(userId);

        res.status(200).json(groups.map(toGroupOverviewResponseDTO));
      } catch (error) {
        next(error);
      }
    },

    async leaveGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const groupId = getGroupId(req);
        const userId = getUserId(req);
        await groupService.leaveGroup(groupId, userId);

        res.sendStatus(204);
      } catch (error) {
        next(error);
      }
    },

    async renameGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const groupId = getGroupId(req);
        const userId = getUserId(req);
        const dto = validateRenameGroupDTO(req.body);
        const group = await groupService.renameGroup(groupId, userId, dto.name);

        res.status(200).json(toGroupResponseDTO(group));
      } catch (error) {
        next(error);
      }
    },
  };
}
