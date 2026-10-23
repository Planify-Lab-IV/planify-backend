import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvatarStorage } from "../src/infrastructure/storage/avatar.storage.js";
import { createLocalAvatarStorage } from "../src/infrastructure/storage/local-avatar.storage.js";
import type { User, UserRepository } from "../src/repositories/user.repository.js";
import { createProfileRouter } from "../src/routes/profile.js";
import {
  createProfileService,
  type ProfileUpdateCoordinator,
} from "../src/services/profile.service.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { errorHandler } from "../src/shared/middlewares/error.middleware.js";
import { createAuthMiddleware } from "../src/shared/middlewares/auth.middleware.js";

const testSecret = "test-secret-que-cumple-con-los-32-caracteres";
const tokenService = createSessionTokenService(testSecret);
const user: User = {
  id: "user-1",
  name: "Ana",
  username: "ana",
  email: "ana@planify.dev",
  avatarUrl: null,
};

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function createInMemoryUserRepository(initialUser: User = user): UserRepository {
  let storedUser = initialUser;

  return {
    findById: vi.fn(async () => storedUser),
    findByUsername: vi.fn(async () => null),
    findByEmail: vi.fn(async () => null),
    findPublicByIdentifier: vi.fn(async () => null),
    findByIdentifier: vi.fn(async () => null),
    searchByUsername: vi.fn(async () => []),
    create: vi.fn(async () => {
      throw new Error("Not used in profile endpoint tests");
    }),
    updatePassword: vi.fn(async () => undefined),
    findPasswordChangedAt: vi.fn(async () => ({ passwordChangedAt: null })),
    updateProfile: vi.fn(async (_id, data) => {
      storedUser = { ...storedUser, ...data };
      return storedUser;
    }),
  };
}

function createAvatarStorage(): AvatarStorage {
  return {
    save: vi.fn(async () => "/uploads/avatars/new-avatar.png"),
    remove: vi.fn(async () => {}),
  };
}

function createApp(
  avatarStorage: AvatarStorage | null,
  uploadsDirectory?: string,
  initialUser: User = user,
  profileUpdateCoordinatorFactory?: (userRepository: UserRepository) => ProfileUpdateCoordinator,
) {
  const userRepository = createInMemoryUserRepository(initialUser);
  const profileUpdateCoordinator = profileUpdateCoordinatorFactory?.(userRepository);
  const profileService = createProfileService(
    userRepository,
    avatarStorage,
    profileUpdateCoordinator,
  );
  const app = express();

  app.use(express.json());
  if (uploadsDirectory) {
    app.use("/uploads", express.static(uploadsDirectory));
  }
  app.use(createProfileRouter(profileService, createAuthMiddleware(tokenService, userRepository)));
  app.use(errorHandler);

  return { app, userRepository };
}

function authenticatedRequest(app: express.Express) {
  return request(app)
    .patch("/me/profile")
    .set("Authorization", `Bearer ${tokenService.sign(user.id)}`);
}

type InvalidProfileRequest = (app: express.Express) => request.Test;
type InvalidProfileCase = [description: string, sendRequest: InvalidProfileRequest];

describe("PATCH /me/profile", () => {
  it("actualiza solo el nombre del usuario autenticado", async () => {
    const { app, userRepository } = createApp(createAvatarStorage());

    const response = await authenticatedRequest(app).send({ name: "  Ana Pérez  " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { ...user, name: "Ana Pérez" },
    });
    expect(userRepository.updateProfile).toHaveBeenCalledWith(user.id, { name: "Ana Pérez" });
  });

  it("guarda y sirve un avatar local junto con el nombre", async () => {
    const uploadsDirectory = await createTemporaryDirectory();
    const { app, userRepository } = createApp(
      createLocalAvatarStorage(join(uploadsDirectory, "avatars")),
      uploadsDirectory,
    );

    const response = await authenticatedRequest(app)
      .field("name", "Ana Pérez")
      .attach("avatar", validPng, {
        filename: "ignored-name.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ name: "Ana Pérez" });
    expect(response.body.user.avatarUrl).toMatch(/^\/uploads\/avatars\/[0-9a-f-]{36}\.png$/);
    expect(userRepository.updateProfile).toHaveBeenCalledWith(user.id, {
      name: "Ana Pérez",
      avatarUrl: response.body.user.avatarUrl,
    });

    const imageResponse = await request(app).get(response.body.user.avatarUrl);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.body).toEqual(expect.any(Buffer));
  });

  it("serializa dos reemplazos concurrentes y elimina el avatar intermedio", async () => {
    const avatarStorage: AvatarStorage = {
      save: vi
        .fn<AvatarStorage["save"]>()
        .mockResolvedValueOnce("/uploads/avatars/first.png")
        .mockResolvedValueOnce("/uploads/avatars/second.png"),
      remove: vi.fn<AvatarStorage["remove"]>().mockResolvedValue(),
    };
    const initialUser = { ...user, avatarUrl: "/uploads/avatars/old.png" };
    const { app, userRepository } = createApp(
      avatarStorage,
      undefined,
      initialUser,
      createSerialProfileUpdateCoordinator,
    );

    const responses = await Promise.all([
      authenticatedRequest(app).attach("avatar", validPng, {
        filename: "first.png",
        contentType: "image/png",
      }),
      authenticatedRequest(app).attach("avatar", validPng, {
        filename: "second.png",
        contentType: "image/png",
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(userRepository.updateProfile).toHaveBeenNthCalledWith(1, user.id, {
      avatarUrl: "/uploads/avatars/first.png",
    });
    expect(userRepository.updateProfile).toHaveBeenNthCalledWith(2, user.id, {
      avatarUrl: "/uploads/avatars/second.png",
    });
    expect(avatarStorage.remove).toHaveBeenNthCalledWith(1, "/uploads/avatars/old.png");
    expect(avatarStorage.remove).toHaveBeenNthCalledWith(2, "/uploads/avatars/first.png");
  });

  const invalidProfileCases: InvalidProfileCase[] = [
    [
      "a MIME type not allowed",
      (app: express.Express) =>
        authenticatedRequest(app).attach("avatar", Buffer.from("not-an-image"), {
          filename: "avatar.txt",
          contentType: "text/plain",
        }),
    ],
    [
      "an avatar larger than 2 MB",
      (app: express.Express) =>
        authenticatedRequest(app).attach("avatar", Buffer.alloc(2 * 1024 * 1024 + 1), {
          filename: "avatar.png",
          contentType: "image/png",
        }),
    ],
    ...["image/png", "image/jpeg", "image/webp"].map(
      (contentType) =>
        [
          `content falsely declared as ${contentType}`,
          (app: express.Express) =>
            authenticatedRequest(app).attach("avatar", Buffer.from("not-an-image"), {
              filename: "avatar.png",
              contentType,
            }),
        ] as InvalidProfileCase,
    ),
    ["an empty name", (app: express.Express) => authenticatedRequest(app).send({ name: "   " })],
    [
      "a name longer than 80 characters",
      (app: express.Express) => authenticatedRequest(app).send({ name: "a".repeat(81) }),
    ],
    [
      "a request without name or avatar",
      (app: express.Express) => authenticatedRequest(app).send({}),
    ],
  ];

  it.each(invalidProfileCases)("returns INVALID_DATA for %s", async (_description, sendRequest) => {
    const { app, userRepository } = createApp(createAvatarStorage());

    const response = await sendRequest(app);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(userRepository.updateProfile).not.toHaveBeenCalled();
  });

  it("allows a name-only update when avatar storage is unavailable", async () => {
    const { app, userRepository } = createApp(null);

    const response = await authenticatedRequest(app).send({ name: "Ana Pérez" });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ name: "Ana Pérez", avatarUrl: null });
    expect(userRepository.updateProfile).toHaveBeenCalledWith(user.id, { name: "Ana Pérez" });
  });

  it("returns AVATAR_STORAGE_UNAVAILABLE without modifying the user", async () => {
    const { app, userRepository } = createApp(null);

    const response = await authenticatedRequest(app).attach("avatar", validPng, {
      filename: "avatar.png",
      contentType: "image/png",
    });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe("AVATAR_STORAGE_UNAVAILABLE");
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(userRepository.updateProfile).not.toHaveBeenCalled();
  });

  it("requires an authenticated user session", async () => {
    const { app, userRepository } = createApp(createAvatarStorage());

    const response = await request(app).patch("/me/profile").attach("avatar", validPng, {
      filename: "avatar.png",
      contentType: "image/png",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(userRepository.updateProfile).not.toHaveBeenCalled();
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "planify-profile-uploads-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createSerialProfileUpdateCoordinator(
  userRepository: UserRepository,
): ProfileUpdateCoordinator {
  const tails = new Map<string, Promise<void>>();

  return {
    async runExclusive<T>(
      userId: string,
      operation: (transactionalUserRepository: UserRepository) => Promise<T>,
    ): Promise<T> {
      const previous = tails.get(userId) ?? Promise.resolve();
      let release: () => void;
      const completion = new Promise<void>((resolve) => {
        release = resolve;
      });
      const next = previous.then(() => completion);
      tails.set(userId, next);

      await previous;

      try {
        return await operation(userRepository);
      } finally {
        release!();
        if (tails.get(userId) === next) {
          tails.delete(userId);
        }
      }
    },
  };
}
