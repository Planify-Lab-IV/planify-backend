import type { NextFunction, Request, Response } from "express";
import type { ProfileService } from "../services/profile.service.js";
import { getAuthenticatedUserId } from "../shared/request.helpers.js";

export interface ProfileController {
  update(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createProfileController(profileService: ProfileService): ProfileController {
  return {
    async update(req, res, next) {
      try {
        const userId = getAuthenticatedUserId(req);
        const input = req.file
          ? {
              name: req.body?.name,
              avatar: {
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
              },
            }
          : { name: req.body?.name };
        const user = await profileService.updateProfile(userId, input);

        res.status(200).json({ user });
      } catch (error) {
        next(error);
      }
    },
  };
}
