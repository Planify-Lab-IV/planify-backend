import { describe, it, expect } from "vitest";
import { createPasswordHasher } from "../src/infrastructure/security/password.hasher.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";

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
  const service = createSessionTokenService("test-secret");

  it("devuelve el usuarioId desde un token firmado", () => {
    const token = service.sign("user-123");
    expect(service.verify(token)).toBe("user-123");
  });

  it("lanza con un token inválido", () => {
    expect(() => service.verify("token-invalido")).toThrow();
  });
});
