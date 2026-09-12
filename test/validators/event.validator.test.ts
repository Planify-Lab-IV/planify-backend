import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/shared/errors/index.js";
import { validateConfirmScheduleDTO } from "../../src/validators/event/event.validator.js";

describe("validateConfirmScheduleDTO", () => {
  it("acepta una fecha ISO-8601 con offset", () => {
    expect(validateConfirmScheduleDTO({ startDateTime: "2099-12-31T22:00:00-03:00" })).toEqual({
      startDateTime: "2099-12-31T22:00:00-03:00",
    });
  });

  it.each([
    undefined,
    {},
    { startDateTime: 123 },
    { startDateTime: "2099-12-31 22:00:00" },
    { startDateTime: "fecha-invalida" },
    { startDateTime: "2099-12-31T22:00:00Z", extra: true },
  ])("rechaza un body inválido: %o", (body) => {
    expect(() => validateConfirmScheduleDTO(body)).toThrow(ValidationError);
  });
});
