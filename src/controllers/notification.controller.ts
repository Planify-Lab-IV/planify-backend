import type { NextFunction, Request, Response } from "express";
import type { NotificationService } from "../services/notification.service.js";
import { getAuthenticatedUserId } from "../shared/request.helpers.js";
import { validatePushDeviceDTO } from "../validators/notification/push-device.validator.js";

export interface NotificationController {
  registerDevice(req: Request, res: Response, next: NextFunction): Promise<void>;
  unregisterDevice(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createNotificationController(
  notificationService: NotificationService,
): NotificationController {
  async function updateDevice(
    req: Request,
    res: Response,
    next: NextFunction,
    operation: (userId: string, token: string) => Promise<void>,
  ): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req);
      const { pushToken } = validatePushDeviceDTO(req.body);
      await operation(userId, pushToken);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  }

  return {
    async registerDevice(req, res, next) {
      await updateDevice(req, res, next, (userId, token) =>
        notificationService.registerDevice(userId, token),
      );
    },
    async unregisterDevice(req, res, next) {
      await updateDevice(req, res, next, (userId, token) =>
        notificationService.unregisterDevice(userId, token),
      );
    },
  };
}
