import type { NextFunction, Request, Response } from "express";
import { toActivityLogResponseDTO } from "../dtos/activity-log/activity-log.response.dto.js";
import { toUnreadCountsResponseDTO } from "../dtos/activity-log/unread-counts.response.dto.js";
import type { ActivityLogService } from "../services/activity-log.service.js";
import {
  getAttendanceActor,
  getAuthenticatedUserId,
  getEventId,
} from "../shared/request.helpers.js";

export interface ActivityLogController {
  list(req: Request, res: Response, next: NextFunction): Promise<void>;
  markAsRead(req: Request, res: Response, next: NextFunction): Promise<void>;
  getUnreadCounts(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createActivityLogController(
  activityLogService: ActivityLogService,
): ActivityLogController {
  return {
    async list(req, res, next) {
      try {
        const eventId = getEventId(req);
        const actor = getAttendanceActor(req);
        const entries = await activityLogService.list(eventId, actor);

        res.status(200).json({ entries: entries.map(toActivityLogResponseDTO) });
      } catch (error) {
        next(error);
      }
    },

    async markAsRead(req, res, next) {
      try {
        const eventId = getEventId(req);
        const actor = getAttendanceActor(req);

        await activityLogService.markAsRead(eventId, actor);
        res.sendStatus(204);
      } catch (error) {
        next(error);
      }
    },

    async getUnreadCounts(req, res, next) {
      try {
        const userId = getAuthenticatedUserId(req);
        const counts = await activityLogService.getUnreadCounts(userId);

        res.status(200).json(toUnreadCountsResponseDTO(counts));
      } catch (error) {
        next(error);
      }
    },
  };
}
