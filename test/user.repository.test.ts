import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

import { prisma } from "../src/infrastructure/prisma.js";
import { userRepository } from "../src/repositories/user.repository.js";

describe("UserRepository.findByUsername", () => {
  const user = {
    id: "user-1",
    name: "Ana",
    username: "ana",
    email: "ana@planify.dev",
  };

  beforeEach(() => vi.clearAllMocks());

  it("busca exclusivamente por username y devuelve solo el usuario público", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(user as never);

    await expect(userRepository.findByUsername(user.username)).resolves.toEqual(user);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: user.username },
      select: { id: true, name: true, username: true, email: true },
    });
  });
});
