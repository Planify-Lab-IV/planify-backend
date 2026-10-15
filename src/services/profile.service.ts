import sharp from "sharp";
import type { AvatarStorage } from "../infrastructure/storage/avatar.storage.js";
import type { User, UserRepository } from "../repositories/user.repository.js";
import {
  AvatarStorageUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "../shared/errors/index.js";

const maxNameLength = 80;
const maxAvatarPixels = 40_000_000;

const avatarMimeTypeByFormat = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

type AvatarFormat = keyof typeof avatarMimeTypeByFormat;

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

export interface ProfileUpdateCoordinator {
  runExclusive<T>(userId: string, operation: () => Promise<T>): Promise<T>;
}

const directProfileUpdateCoordinator: ProfileUpdateCoordinator = {
  runExclusive(_userId, operation) {
    return operation();
  },
};

export function createProfileService(
  userRepository: UserRepository,
  avatarStorage: AvatarStorage | null,
  profileUpdateCoordinator: ProfileUpdateCoordinator = directProfileUpdateCoordinator,
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

      let avatar: AvatarUpload | undefined;
      if (hasAvatar) {
        const uploadedAvatar = input.avatar;
        if (!isAvatarUpload(uploadedAvatar)) {
          throw new ValidationError("El avatar es inválido");
        }

        avatar = await validateAvatar(uploadedAvatar);
      }

      return profileUpdateCoordinator.runExclusive(userId, async () => {
        const currentUser = await userRepository.findById(userId);
        if (!currentUser) {
          throw new UnauthorizedError("La sesión ya no corresponde a un usuario activo");
        }

        let newAvatarUrl: string | undefined;

        if (avatar) {
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
      });
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

async function validateAvatar(avatar: AvatarUpload): Promise<AvatarUpload> {
  try {
    const image = sharp(avatar.buffer, {
      failOn: "error",
      limitInputPixels: maxAvatarPixels,
    });
    const metadata = await image.metadata();
    const format = getAvatarFormat(metadata.format);

    if (!format) {
      throw new Error("Unsupported avatar format");
    }

    return {
      buffer: await image.toFormat(format).toBuffer(),
      mimeType: avatarMimeTypeByFormat[format],
    };
  } catch {
    throw new ValidationError("El avatar debe ser una imagen JPEG, PNG o WebP válida");
  }
}

function getAvatarFormat(format: string | undefined): AvatarFormat | null {
  return format && format in avatarMimeTypeByFormat ? (format as AvatarFormat) : null;
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
