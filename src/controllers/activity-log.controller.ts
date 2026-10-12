import type { NextFunction, Request, Response } from "express";
import { toActivityLogResponseDTO } from "../dtos/activity-log/activity-log.response.dto.js";
import type { ActivityLogService } from "../services/activity-log.service.js";
import { getAttendanceActor, getEventId } from "../shared/request.helpers.js";

export interface ActivityLogController {
  list(req: Request, res: Response, next: NextFunction): Promise<void>;
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
  };
}
