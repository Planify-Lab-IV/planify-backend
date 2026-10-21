import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createPasswordHasher } from "../../src/infrastructure/security/password.hasher.js";
import { prisma } from "../../src/infrastructure/prisma.js";
import { passwordResetCodeRepository } from "../../src/repositories/password-reset-code.repository.js";
import { userRepository } from "../../src/repositories/user.repository.js";
import { createPasswordResetService } from "../../src/services/password-reset.service.js";

const createdUserIds: string[] = [];

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
});

async function createUser() {
  const id = randomUUID();
  createdUserIds.push(id);
  return prisma.user.create({
    data: {
      id,
      name: "Ana",
      username: `ana-${id}`,
      email: `ana-${id}@planify.dev`,
      passwordHash: "previous-password-hash",
    },
  });
}

function createService(sentCodes: string[]) {
  const passwordHasher = createPasswordHasher();
  const service = createPasswordResetService(
    userRepository,
    passwordResetCodeRepository,
    passwordHasher,
    {
      sendResetCode: async ({ code }) => {
        sentCodes.push(code);
      },
    },
    () => new Date(),
  );

  return { service, passwordHasher };
}

describe("password reset concurrency", () => {
  it("mantiene un único código activo y permite usar el último código emitido", async () => {
    const user = await createUser();
    const sentCodes: string[] = [];
    const { service, passwordHasher } = createService(sentCodes);

    await Promise.all([service.requestReset(user.email), service.requestReset(user.email)]);

    const activeCodes = await prisma.passwordResetCode.findMany({
      where: { userId: user.id, usedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect(activeCodes).toHaveLength(1);
    expect(sentCodes).toHaveLength(2);
    const activeCode = activeCodes[0];
    if (!activeCode) throw new Error("Expected one active reset code");

    const matchingCode = (
      await Promise.all(
        sentCodes.map(async (code) => ({
          code,
          matches: await passwordHasher.compare(code, activeCode.codeHash),
        })),
      )
    ).find(({ matches }) => matches)?.code;
    expect(matchingCode).toBeDefined();

    await expect(
      service.resetPassword(user.email, matchingCode!, "NuevaClave123!"),
    ).resolves.toBeUndefined();

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await passwordHasher.compare("NuevaClave123!", updatedUser.passwordHash)).toBe(true);
    await expect(
      prisma.passwordResetCode.count({ where: { userId: user.id, usedAt: null } }),
    ).resolves.toBe(0);
  });

  it("no supera tres códigos creados dentro de una hora bajo pedidos paralelos", async () => {
    const user = await createUser();
    const sentCodes: string[] = [];
    const { service } = createService(sentCodes);

    await Promise.all(Array.from({ length: 4 }, () => service.requestReset(user.email)));

    await expect(prisma.passwordResetCode.count({ where: { userId: user.id } })).resolves.toBe(3);
    await expect(
      prisma.passwordResetCode.count({ where: { userId: user.id, usedAt: null } }),
    ).resolves.toBe(1);
    expect(sentCodes).toHaveLength(3);
  });
});
