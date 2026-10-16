import { describe, expect, it, vi } from "vitest";
import type { PasswordResetNotifier } from "../src/infrastructure/notifications/password-reset.notifier.js";
import type { PasswordHasher } from "../src/infrastructure/security/password.hasher.js";
import type { PasswordResetCodeRepository } from "../src/repositories/password-reset-code.repository.js";
import type { User, UserRepository } from "../src/repositories/user.repository.js";
import { createPasswordResetService } from "../src/services/password-reset.service.js";
import { InvalidResetCodeError } from "../src/shared/errors/index.js";

const user: User = {
  id: "user-1",
  name: "Ana",
  username: "ana",
  email: "ana@planify.dev",
  avatarUrl: null,
};
const now = new Date("2026-10-15T12:00:00.000Z");

function makeUserRepository(foundUser: User | null = user): UserRepository {
  return {
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByEmail: vi.fn(async () => foundUser),
    findPublicByIdentifier: vi.fn(),
    findByIdentifier: vi.fn(),
    create: vi.fn(),
    updatePassword: vi.fn(),
    findPasswordChangedAt: vi.fn(),
    updateProfile: vi.fn(),
  };
}

function makeCodeRepository(): PasswordResetCodeRepository {
  return {
    create: vi.fn(),
    countCreatedSince: vi.fn(async () => 0),
    invalidateActiveForUser: vi.fn(),
    reserveAttempt: vi.fn(async () => ({ id: "code-1", codeHash: "hash:123456" })),
    markUsed: vi.fn(async () => true),
  };
}

function makeHasher(): PasswordHasher {
  return {
    hash: vi.fn(async (value) => `hash:${value}`),
    compare: vi.fn(async (value, hash) => `hash:${value}` === hash),
  };
}

function makeNotifier(): PasswordResetNotifier {
  return { sendResetCode: vi.fn(async () => undefined) };
}

function makeService(foundUser: User | null = user) {
  const userRepository = makeUserRepository(foundUser);
  const codeRepository = makeCodeRepository();
  const passwordHasher = makeHasher();
  const notifier = makeNotifier();
  const service = createPasswordResetService(
    userRepository,
    codeRepository,
    passwordHasher,
    notifier,
    () => now,
  );
  return { service, userRepository, codeRepository, passwordHasher, notifier };
}

describe("PasswordResetService", () => {
  it("normaliza el email, invalida el código previo y envía uno de seis dígitos hasheado", async () => {
    const { service, userRepository, codeRepository, passwordHasher, notifier } = makeService();

    await service.requestReset("  ANA@PLANIFY.DEV ");

    expect(userRepository.findByEmail).toHaveBeenCalledWith(user.email);
    expect(codeRepository.invalidateActiveForUser).toHaveBeenCalledWith(user.id, now);
    expect(codeRepository.create).toHaveBeenCalledWith({
      userId: user.id,
      codeHash: expect.stringMatching(/^hash:\d{6}$/),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    });
    expect(notifier.sendResetCode).toHaveBeenCalledWith({
      email: user.email,
      code: expect.stringMatching(/^\d{6}$/),
    });
    expect(passwordHasher.hash).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/));
  });

  it("no revela ni genera datos cuando el email no existe", async () => {
    const { service, codeRepository, notifier } = makeService(null);

    await expect(service.requestReset("missing@planify.dev")).resolves.toBeUndefined();
    expect(codeRepository.create).not.toHaveBeenCalled();
    expect(notifier.sendResetCode).not.toHaveBeenCalled();
  });

  it("silencia la cuarta solicitud dentro de la hora", async () => {
    const { service, codeRepository, notifier } = makeService();
    vi.mocked(codeRepository.countCreatedSince).mockResolvedValueOnce(3);

    await service.requestReset(user.email);

    expect(codeRepository.invalidateActiveForUser).not.toHaveBeenCalled();
    expect(codeRepository.create).not.toHaveBeenCalled();
    expect(notifier.sendResetCode).not.toHaveBeenCalled();
  });

  it("cambia la contraseña después de reservar y consumir un código correcto", async () => {
    const { service, codeRepository, passwordHasher, userRepository } = makeService();

    await service.resetPassword(user.email, "123456", "NuevaClave123!");

    expect(codeRepository.reserveAttempt).toHaveBeenCalledWith(user.id, now, 5);
    expect(codeRepository.markUsed).toHaveBeenCalledWith("code-1", now);
    expect(passwordHasher.hash).toHaveBeenLastCalledWith("NuevaClave123!");
    expect(userRepository.updatePassword).toHaveBeenCalledWith(
      user.id,
      "hash:NuevaClave123!",
      now,
    );
  });

  it.each([
    ["no existe el usuario", null, undefined, true, "123456"],
    ["está vencido o agotado", user, null, true, "123456"],
    ["el código es incorrecto", user, { id: "code-1", codeHash: "hash:654321" }, true, "123456"],
    ["ya fue usado concurrentemente", user, { id: "code-1", codeHash: "hash:123456" }, false, "123456"],
  ])("devuelve el mismo error cuando %s", async (_caseName, foundUser, reserved, markUsed, code) => {
    const { service, codeRepository, userRepository } = makeService(foundUser as User | null);
    vi.mocked(codeRepository.reserveAttempt).mockResolvedValueOnce(
      (reserved as { id: string; codeHash: string } | null | undefined) ?? null,
    );
    vi.mocked(codeRepository.markUsed).mockResolvedValueOnce(markUsed as boolean);

    await expect(service.resetPassword(user.email, code, "NuevaClave123!")).rejects.toBeInstanceOf(
      InvalidResetCodeError,
    );
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
  });
});
