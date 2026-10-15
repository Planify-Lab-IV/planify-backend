import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostgresProfileUpdateCoordinator } from "../src/infrastructure/profile-update.coordinator.js";
import { prisma } from "../src/infrastructure/prisma.js";
import type { AvatarStorage } from "../src/infrastructure/storage/avatar.storage.js";
import { createUserRepository, type User } from "../src/repositories/user.repository.js";
import { createProfileService } from "../src/services/profile.service.js";

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const createdUserIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdUserIds.splice(0).map((id) => prisma.user.delete({ where: { id } }).catch(() => {})),
  );
});

describe("createPostgresProfileUpdateCoordinator", () => {
  it("elimina el avatar intermedio durante dos reemplazos concurrentes", async () => {
    const initialUser = await createTestUser();
    const firstAvatarUrl = "/uploads/avatars/first.png";
    const secondAvatarUrl = "/uploads/avatars/second.png";
    const avatarStorage: AvatarStorage = {
      save: vi
        .fn<AvatarStorage["save"]>()
        .mockResolvedValueOnce(firstAvatarUrl)
        .mockResolvedValueOnce(secondAvatarUrl),
      remove: vi.fn<AvatarStorage["remove"]>().mockResolvedValue(),
    };
    const userRepository = createUserRepository(prisma);
    const service = createProfileService(
      userRepository,
      avatarStorage,
      createPostgresProfileUpdateCoordinator(),
    );

    await Promise.all([
      service.updateProfile(initialUser.id, {
        avatar: { buffer: validPng, mimeType: "image/png" },
      }),
      service.updateProfile(initialUser.id, {
        avatar: { buffer: validPng, mimeType: "image/png" },
      }),
    ]);

    const updatedUser = await userRepository.findById(initialUser.id);
    expect(updatedUser?.avatarUrl).toBeOneOf([firstAvatarUrl, secondAvatarUrl]);

    const discardedAvatarUrl =
      updatedUser?.avatarUrl === firstAvatarUrl ? secondAvatarUrl : firstAvatarUrl;
    expect(avatarStorage.remove).toHaveBeenCalledWith(initialUser.avatarUrl);
    expect(avatarStorage.remove).toHaveBeenCalledWith(discardedAvatarUrl);
  });
});

async function createTestUser(): Promise<User> {
  const id = randomUUID();
  createdUserIds.push(id);

  return prisma.user.create({
    data: {
      id,
      name: "Profile concurrency test",
      username: `profile-concurrency-${id}`,
      email: `profile-concurrency-${id}@planify.test`,
      passwordHash: "not-used-by-this-test",
      avatarUrl: "/uploads/avatars/original.png",
    },
    select: { id: true, name: true, username: true, email: true, avatarUrl: true },
  });
}
