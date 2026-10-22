import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvatarStorage } from "../src/infrastructure/storage/avatar.storage.js";
import type { User, UserRepository } from "../src/repositories/user.repository.js";
import { createProfileService } from "../src/services/profile.service.js";
import {
  AvatarStorageUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "../src/shared/errors/index.js";

const user: User = {
  id: "user-1",
  name: "Ana",
  username: "ana",
  email: "ana@planify.dev",
  avatarUrl: "/uploads/avatars/old-avatar.jpg",
};

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

afterEach(() => vi.restoreAllMocks());

function createInMemoryUserRepository(initialUser: User | null = user): UserRepository {
  let storedUser = initialUser;

  return {
    findById: vi.fn(async () => storedUser),
    findByUsername: vi.fn(async () => null),
    findByEmail: vi.fn(async () => null),
    findPublicByIdentifier: vi.fn(async () => null),
    findByIdentifier: vi.fn(async () => null),
    searchByUsername: vi.fn(async () => []),
    create: vi.fn(async () => {
      throw new Error("Not used in profile tests");
    }),
    updatePassword: vi.fn(async () => undefined),
    findPasswordChangedAt: vi.fn(async () => (storedUser ? { passwordChangedAt: null } : null)),
    updateProfile: vi.fn(async (_id, data): Promise<User> => {
      if (!storedUser) {
        throw new Error("User not found");
      }

      const updatedUser: User = { ...storedUser, ...data };
      storedUser = updatedUser;
      return updatedUser;
    }),
  };
}

function createAvatarStorage(url = "/uploads/avatars/new-avatar.png"): AvatarStorage {
  return {
    save: vi.fn(async () => url),
    remove: vi.fn(async () => {}),
  };
}

describe("ProfileService.updateProfile", () => {
  it("actualiza solo el nombre normalizado", async () => {
    const userRepository = createInMemoryUserRepository();
    const avatarStorage = createAvatarStorage();
    const service = createProfileService(userRepository, avatarStorage);

    await expect(service.updateProfile(user.id, { name: "  Ana Pérez  " })).resolves.toMatchObject({
      name: "Ana Pérez",
      avatarUrl: user.avatarUrl,
    });

    expect(userRepository.updateProfile).toHaveBeenCalledWith(user.id, { name: "Ana Pérez" });
    expect(avatarStorage.save).not.toHaveBeenCalled();
    expect(avatarStorage.remove).not.toHaveBeenCalled();
  });

  it("guarda un avatar nuevo y elimina el anterior después de actualizar al usuario", async () => {
    const userRepository = createInMemoryUserRepository();
    const avatarStorage = createAvatarStorage();
    const service = createProfileService(userRepository, avatarStorage);
    const avatar = { buffer: validPng, mimeType: "image/png" };

    await expect(service.updateProfile(user.id, { avatar })).resolves.toMatchObject({
      avatarUrl: "/uploads/avatars/new-avatar.png",
    });

    expect(avatarStorage.save).toHaveBeenCalledWith({
      buffer: expect.any(Buffer),
      mimeType: "image/png",
    });
    expect(userRepository.updateProfile).toHaveBeenCalledWith(user.id, {
      avatarUrl: "/uploads/avatars/new-avatar.png",
    });
    expect(avatarStorage.remove).toHaveBeenCalledWith(user.avatarUrl);
  });

  it("actualiza nombre y avatar en la misma operación", async () => {
    const userRepository = createInMemoryUserRepository({ ...user, avatarUrl: null });
    const avatarStorage = createAvatarStorage();
    const service = createProfileService(userRepository, avatarStorage);

    await expect(
      service.updateProfile(user.id, {
        name: "Ana Pérez",
        avatar: { buffer: validPng, mimeType: "image/jpeg" },
      }),
    ).resolves.toMatchObject({
      name: "Ana Pérez",
      avatarUrl: "/uploads/avatars/new-avatar.png",
    });

    expect(userRepository.updateProfile).toHaveBeenCalledWith(user.id, {
      name: "Ana Pérez",
      avatarUrl: "/uploads/avatars/new-avatar.png",
    });
  });

  it("mantiene el éxito si falla el borrado del avatar anterior", async () => {
    const userRepository = createInMemoryUserRepository();
    const avatarStorage = createAvatarStorage();
    vi.mocked(avatarStorage.remove).mockRejectedValueOnce(new Error("Storage unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = createProfileService(userRepository, avatarStorage);

    await expect(
      service.updateProfile(user.id, {
        avatar: { buffer: validPng, mimeType: "image/png" },
      }),
    ).resolves.toMatchObject({ avatarUrl: "/uploads/avatars/new-avatar.png" });

    expect(errorSpy).toHaveBeenCalledWith(
      "No se pudo borrar el avatar anterior",
      expect.any(Error),
    );
  });

  it("rechaza un avatar cuando no hay almacenamiento antes de consultar o modificar al usuario", async () => {
    const userRepository = createInMemoryUserRepository();
    const service = createProfileService(userRepository, null);

    await expect(
      service.updateProfile(user.id, {
        avatar: { buffer: Buffer.from("image"), mimeType: "image/png" },
      }),
    ).rejects.toBeInstanceOf(AvatarStorageUnavailableError);

    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(userRepository.updateProfile).not.toHaveBeenCalled();
  });

  const invalidProfileCases: Array<[string, unknown]> = [
    ["sin cambios", {}],
    ["nombre vacío", { name: "   " }],
    ["nombre demasiado largo", { name: "a".repeat(81) }],
    ["nombre que no es texto", { name: 42 }],
    ["avatar inválido", { avatar: null }],
  ];

  it.each(invalidProfileCases)("rechaza un perfil %s", async (_description, input) => {
    const userRepository = createInMemoryUserRepository();
    const service = createProfileService(userRepository, createAvatarStorage());

    await expect(service.updateProfile(user.id, input as never)).rejects.toBeInstanceOf(
      ValidationError,
    );

    expect(userRepository.updateProfile).not.toHaveBeenCalled();
  });

  it.each(["image/png", "image/jpeg", "image/webp"])(
    "rechaza contenido que solo declara ser %s sin reemplazar el avatar anterior",
    async (mimeType) => {
      const userRepository = createInMemoryUserRepository();
      const avatarStorage = createAvatarStorage();
      const service = createProfileService(userRepository, avatarStorage);

      await expect(
        service.updateProfile(user.id, {
          avatar: { buffer: Buffer.from("no es una imagen"), mimeType },
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(avatarStorage.save).not.toHaveBeenCalled();
      expect(userRepository.updateProfile).not.toHaveBeenCalled();
      expect(avatarStorage.remove).not.toHaveBeenCalled();
    },
  );

  it("no actualiza al usuario si guardar el avatar falla", async () => {
    const userRepository = createInMemoryUserRepository();
    const avatarStorage = createAvatarStorage();
    vi.mocked(avatarStorage.save).mockRejectedValueOnce(new Error("Storage unavailable"));
    const service = createProfileService(userRepository, avatarStorage);

    await expect(
      service.updateProfile(user.id, {
        avatar: { buffer: validPng, mimeType: "image/png" },
      }),
    ).rejects.toThrow("Storage unavailable");

    expect(userRepository.updateProfile).not.toHaveBeenCalled();
  });

  it("limpia el avatar nuevo si falla la actualización de la base", async () => {
    const userRepository = createInMemoryUserRepository();
    vi.mocked(userRepository.updateProfile).mockRejectedValueOnce(
      new Error("Database unavailable"),
    );
    const avatarStorage = createAvatarStorage();
    const service = createProfileService(userRepository, avatarStorage);

    await expect(
      service.updateProfile(user.id, {
        avatar: { buffer: validPng, mimeType: "image/png" },
      }),
    ).rejects.toThrow("Database unavailable");

    expect(avatarStorage.remove).toHaveBeenCalledWith("/uploads/avatars/new-avatar.png");
  });

  it("rechaza una sesión cuyo usuario ya no existe", async () => {
    const userRepository = createInMemoryUserRepository(null);
    const service = createProfileService(userRepository, createAvatarStorage());

    await expect(service.updateProfile(user.id, { name: "Ana Pérez" })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
