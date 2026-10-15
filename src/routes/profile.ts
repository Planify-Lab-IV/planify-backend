import { S3Client } from "@aws-sdk/client-s3";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { join } from "node:path";
import { createProfileController } from "../controllers/profile.controller.js";
import {
  avatarMimeTypes,
  type AvatarMimeType,
  type AvatarStorage,
} from "../infrastructure/storage/avatar.storage.js";
import { createLocalAvatarStorage } from "../infrastructure/storage/local-avatar.storage.js";
import { createS3AvatarStorage } from "../infrastructure/storage/s3-avatar.storage.js";
import { createPostgresProfileUpdateCoordinator } from "../infrastructure/profile-update.coordinator.js";
import { userRepository } from "../repositories/user.repository.js";
import { createProfileService, type ProfileService } from "../services/profile.service.js";
import { ValidationError } from "../shared/errors/index.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { env, getAvatarStorageMode } from "../shared/config/env.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";

const maxAvatarSizeBytes = 2 * 1024 * 1024;

// Multer procesa multipart/form-data para recibir archivos.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxAvatarSizeBytes, files: 1 },
  fileFilter(_req, file, callback) {
    if (!avatarMimeTypes.includes(file.mimetype as AvatarMimeType)) {
      callback(new ValidationError("El avatar debe ser JPEG, PNG o WebP"));
      return;
    }

    callback(null, true);
  },
});

export function createAvatarUploadMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single("avatar")(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        next(new ValidationError("El avatar es inválido"));
        return;
      }

      next(error);
    });
  };
}

export function createProfileRouter(
  profileService: ProfileService,
  requireAuthenticatedUser: RequestHandler,
): Router {
  const router = Router();
  const profileController = createProfileController(profileService);

  router.patch(
    "/me/profile",
    requireAuthenticatedUser,
    createAvatarUploadMiddleware(),
    (req, res, next) => profileController.update(req, res, next),
  );

  return router;
}

function createAvatarStorage(): AvatarStorage | null {
  const mode = getAvatarStorageMode(env);

  if (mode === "local") {
    return createLocalAvatarStorage(join(process.cwd(), "uploads", "avatars"));
  }

  if (mode === "s3") {
    const bucket = env.AVATAR_S3_BUCKET;
    const region = env.AWS_REGION;

    if (!bucket || !region) {
      throw new Error("AVATAR_S3_BUCKET y AWS_REGION son requeridas para el almacenamiento S3");
    }

    return createS3AvatarStorage({
      client: new S3Client({ region }),
      bucket,
      region,
    });
  }

  return null;
}

const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAuthenticatedUser = createAuthMiddleware(sessionTokenService);
const profileService = createProfileService(
  userRepository,
  createAvatarStorage(),
  createPostgresProfileUpdateCoordinator(),
);

export default createProfileRouter(profileService, requireAuthenticatedUser);
