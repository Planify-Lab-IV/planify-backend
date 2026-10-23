import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { createSessionTokenService } from "../../src/infrastructure/security/session.token.service.js";
import type { UserRepository } from "../../src/repositories/user.repository.js";
import { validateUserSession } from "../../src/shared/auth/user.session.validator.js";
import { UnauthorizedError } from "../../src/shared/errors/index.js";

const secret = "test-secret-que-cumple-con-los-32-caracteres";

function makeRepository(passwordChangedAt: Date | null, exists = true): UserRepository {
  return {
    findById: vi.fn(),
    findByUsername: vi.fn(),
    findByEmail: vi.fn(),
    findPublicByIdentifier: vi.fn(),
    findByIdentifier: vi.fn(),
    searchByUsername: vi.fn(async () => []),
    create: vi.fn(),
    updatePassword: vi.fn(),
    findPasswordChangedAt: vi.fn(async () => (exists ? { passwordChangedAt } : null)),
    updateProfile: vi.fn(),
  };
}

describe("validateUserSession", () => {
  it("rechaza un token emitido antes del cambio de contraseña", async () => {
    const tokenService = createSessionTokenService(secret);
    const token = tokenService.sign("user-1");
    const issuedAt = tokenService.verify(token).issuedAt;

    await expect(
      validateUserSession(token, tokenService, makeRepository(new Date((issuedAt + 1) * 1000))),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("acepta un token emitido en el mismo segundo, uno posterior y una cuenta sin cambios", async () => {
    const tokenService = createSessionTokenService(secret);
    const token = tokenService.sign("user-1");
    const issuedAt = tokenService.verify(token).issuedAt;

    await expect(
      validateUserSession(token, tokenService, makeRepository(new Date(issuedAt * 1000 + 999))),
    ).resolves.toBe("user-1");
    const laterToken = jwt.sign({ sub: "user-1", sessionType: "user", iat: issuedAt + 1 }, secret, {
      expiresIn: "7d",
    });
    await expect(
      validateUserSession(
        laterToken,
        tokenService,
        makeRepository(new Date(issuedAt * 1000 + 999)),
      ),
    ).resolves.toBe("user-1");
    await expect(validateUserSession(token, tokenService, makeRepository(null))).resolves.toBe(
      "user-1",
    );
  });

  it("rechaza una sesión cuyo usuario fue eliminado", async () => {
    const tokenService = createSessionTokenService(secret);
    await expect(
      validateUserSession(tokenService.sign("user-1"), tokenService, makeRepository(null, false)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
