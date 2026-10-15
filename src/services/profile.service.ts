import type { AvatarStorage } from "../infrastructure/storage/avatar.storage.js";
import type { User, UserRepository } from "../repositories/user.repository.js";
import {
  AvatarStorageUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "../shared/errors/index.js";

const maxNameLength = 80;

export interface AvatarUpload {
  buffer: Buffer;
  mimeType: string;
}

export interface UpdateProfileInput {
  name?: unknown;
  avatar?: AvatarUpload;
}

export interface ProfileService {
  updateProfile(userId: string, input: UpdateProfileInput): Promise<User>;
}

export function createProfileService(
  userRepository: UserRepository,
  avatarStorage: AvatarStorage | null,
): ProfileService {
  return {
    async updateProfile(userId, input) {
      const hasName = input.name !== undefined;
      const hasAvatar = input.avatar !== undefined;

      if (!hasName && !hasAvatar) {
        throw new ValidationError("Debe enviarse un nombre o un avatar");
      }

      const name = hasName ? validateName(input.name) : undefined;

      if (hasAvatar && !avatarStorage) {
        throw new AvatarStorageUnavailableError();
      }

      const currentUser = await userRepository.findById(userId);
      if (!currentUser) {
        throw new UnauthorizedError("La sesión ya no corresponde a un usuario activo");
      }

      let newAvatarUrl: string | undefined;

      if (hasAvatar) {
        const avatar = input.avatar;
        if (!isAvatarUpload(avatar)) {
          throw new ValidationError("El avatar es inválido");
        }

        newAvatarUrl = await avatarStorage!.save(avatar);
      }

      try {
        const updatedUser = await userRepository.updateProfile(
          userId,
          createUpdateData(name, newAvatarUrl),
        );

        if (newAvatarUrl && currentUser.avatarUrl) {
          try {
            await avatarStorage!.remove(currentUser.avatarUrl);
          } catch (error) {
            console.error("No se pudo borrar el avatar anterior", error);
          }
        }

        return updatedUser;
      } catch (error) {
        if (newAvatarUrl) {
          try {
            await avatarStorage!.remove(newAvatarUrl);
          } catch (cleanupError) {
            console.error("No se pudo limpiar el avatar nuevo tras un error", cleanupError);
          }
        }

        throw error;
      }
    },
  };
}

function validateName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("El nombre es inválido");
  }

  const name = value.trim();
  if (!name || name.length > maxNameLength) {
    throw new ValidationError("El nombre debe tener entre 1 y 80 caracteres");
  }

  return name;
}

function isAvatarUpload(value: unknown): value is AvatarUpload {
  return (
    typeof value === "object" &&
    value !== null &&
    "buffer" in value &&
    Buffer.isBuffer(value.buffer) &&
    "mimeType" in value &&
    typeof value.mimeType === "string"
  );
}

function createUpdateData(
  name: string | undefined,
  avatarUrl: string | undefined,
): {
  name?: string;
  avatarUrl?: string;
} {
  const data: { name?: string; avatarUrl?: string } = {};

  if (name !== undefined) {
    data.name = name;
  }
  if (avatarUrl !== undefined) {
    data.avatarUrl = avatarUrl;
  }

  return data;
}
