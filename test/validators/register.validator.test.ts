import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/shared/errors/index.js";
import { validateRegisterDTO } from "../../src/validators/auth/register.validator.js";

describe("validateRegisterDTO", () => {
  it("acepta datos válidos y normaliza las identidades", () => {
    expect(
      validateRegisterDTO({
        name: "  Ana Pérez  ",
        username: "  Ana_Perez  ",
        email: "  ANA@MAIL.COM  ",
        password: "password-segura",
      }),
    ).toEqual({
      name: "Ana Pérez",
      username: "ana_perez",
      email: "ana@mail.com",
      password: "password-segura",
    });
  });

  it("acepta una contraseña de 72 bytes UTF-8 sin modificarla", () => {
    const password = "é".repeat(36);

    expect(
      validateRegisterDTO({
        name: "Ana",
        username: "ana",
        email: "ana@mail.com",
        password,
      }).password,
    ).toBe(password);
  });

  it.each([
    { name: "", username: "ana", email: "ana@mail.com", password: "password-segura" },
    { name: "a".repeat(81), username: "ana", email: "ana@mail.com", password: "password-segura" },
    { name: "Ana", username: "an", email: "ana@mail.com", password: "password-segura" },
    { name: "Ana", username: "a".repeat(31), email: "ana@mail.com", password: "password-segura" },
    { name: "Ana", username: "ana perez", email: "ana@mail.com", password: "password-segura" },
    { name: "Ana", username: "ana", email: "correo-invalido", password: "password-segura" },
    { name: "Ana", username: "ana", email: "ana@mail.com", password: "corta" },
    { name: "Ana", username: "ana", email: "ana@mail.com", password: "        " },
    { name: "Ana", username: "ana", email: "ana@mail.com", password: "a".repeat(73) },
    { name: "Ana", username: "ana", email: "ana@mail.com", password: "é".repeat(36) + "A" },
    {
      name: "Ana",
      username: "ana",
      email: "ana@mail.com",
      password: "password-segura",
      extra: true,
    },
  ])("rechaza un body inválido: %o", (body) => {
    expect(() => validateRegisterDTO(body)).toThrow(ValidationError);
  });
});
