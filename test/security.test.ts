import { describe, it, expect } from "vitest";
import { createPasswordHasher } from "../src/infrastructure/security/password.hasher.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";

const TEST_SECRET = "test-secret-que-cumple-con-los-32-caracteres";

describe("PasswordHasher", () => {
  const hasher = createPasswordHasher();

  it("devuelve un hash distinto a la contraseña en texto plano", async () => {
    const hash = await hasher.hash("miClave");
    expect(hash).not.toBe("miClave");
  });

  it("compara true con la contraseña correcta", async () => {
    const hash = await hasher.hash("miClave");
    await expect(hasher.compare("miClave", hash)).resolves.toBe(true);
  });

  it("compara false con una contraseña incorrecta", async () => {
    const hash = await hasher.hash("miClave");
    await expect(hasher.compare("otra", hash)).resolves.toBe(false);
  });
});

describe("SessionTokenService", () => {
  const service = createSessionTokenService(TEST_SECRET);

  it("returns the user ID from a signed token", () => {
    const token = service.sign("user-123");
    expect(service.verify(token)).toBe("user-123");
  });

  it("lanza con un token inválido", () => {
    expect(() => service.verify("token-invalido")).toThrow();
  });
});
