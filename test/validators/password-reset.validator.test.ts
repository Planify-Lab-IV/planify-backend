import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/shared/errors/index.js";
import { validateForgotPasswordDTO } from "../../src/validators/auth/forgot-password.validator.js";
import { validateResetPasswordDTO } from "../../src/validators/auth/reset-password.validator.js";

describe("validadores de recuperación de contraseña", () => {
  it("normaliza el email de la solicitud", () => {
    expect(validateForgotPasswordDTO({ email: " ANA@MAIL.COM " })).toEqual({
      email: "ana@mail.com",
    });
  });

  it.each([{ email: "invalido" }, { email: "ana@mail.com", extra: true }])(
    "rechaza solicitudes inválidas",
    (body) => {
      expect(() => validateForgotPasswordDTO(body)).toThrow(ValidationError);
    },
  );

  it("acepta un código de seis dígitos y contraseña de 72 bytes", () => {
    expect(
      validateResetPasswordDTO({
        email: " ANA@MAIL.COM ",
        code: "001234",
        newPassword: "é".repeat(36),
      }),
    ).toEqual({ email: "ana@mail.com", code: "001234", newPassword: "é".repeat(36) });
  });

  it.each([
    { email: "ana@mail.com", code: "12345", newPassword: "NuevaClave123!" },
    { email: "ana@mail.com", code: "abcdef", newPassword: "NuevaClave123!" },
    { email: "ana@mail.com", code: "123456", newPassword: "corta" },
    { email: "ana@mail.com", code: "123456", newPassword: "é".repeat(36) + "A" },
    { email: "ana@mail.com", code: "123456", newPassword: "NuevaClave123!", extra: true },
  ])("rechaza un reseteo inválido", (body) => {
    expect(() => validateResetPasswordDTO(body)).toThrow(ValidationError);
  });
});
