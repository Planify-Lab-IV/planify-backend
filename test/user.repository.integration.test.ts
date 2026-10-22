import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/infrastructure/prisma.js";
import { createUserRepository } from "../src/repositories/user.repository.js";

const createdUserIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdUserIds.splice(0).map((id) => prisma.user.delete({ where: { id } }).catch(() => {})),
  );
});

describe("UserRepository.searchByUsername", () => {
  it("trata %, _ y barra invertida como texto literal en PostgreSQL", async () => {
    const token = randomUUID().replaceAll("-", "");
    const literalUnderscores = await createTestUser(`${token}__needle`);
    const literalPercents = await createTestUser(`${token}%%needle`);
    const literalBackslash = await createTestUser(`${token}\\needle`);
    const literalUnderscore = await createTestUser(`${token}juan_perez`);
    await createTestUser(`${token}xxneedle`);
    await createTestUser(`${token}juanXperez`);

    const repository = createUserRepository(prisma);

    await expect(
      repository.searchByUsername(`${token}__needle`, {
        excludeUserId: "excluded-user",
        limit: 20,
      }),
    ).resolves.toEqual([literalUnderscores]);

    await expect(
      repository.searchByUsername(`${token}%%needle`, {
        excludeUserId: "excluded-user",
        limit: 20,
      }),
    ).resolves.toEqual([literalPercents]);

    await expect(
      repository.searchByUsername(`${token}\\needle`, {
        excludeUserId: "excluded-user",
        limit: 20,
      }),
    ).resolves.toEqual([literalBackslash]);

    await expect(
      repository.searchByUsername(`${token}juan_p`, {
        excludeUserId: "excluded-user",
        limit: 20,
      }),
    ).resolves.toEqual([literalUnderscore]);
  });
});

async function createTestUser(username: string) {
  const id = randomUUID();
  createdUserIds.push(id);

  return prisma.user.create({
    data: {
      id,
      name: "Username search test",
      username,
      email: `${id}@planify.test`,
      passwordHash: "not-used-by-this-test",
    },
    select: { id: true, name: true, username: true },
  });
}
