import { describe, expect, it } from "vitest";
import { validateAvailabilityRequestDTO } from "../../src/validators/availability/availability.validator.js";
import { ValidationError } from "../../src/shared/errors/index.js";

describe("validateAvailabilityRequestDTO", () => {
  it("acepta una lista de slots con la forma esperada", () => {
    expect(
      validateAvailabilityRequestDTO({
        slots: [{ weekDay: 0, hourBlock: 9 }],
      }),
    ).toEqual({ slots: [{ weekDay: 0, hourBlock: 9 }] });
  });

  it.each([
    undefined,
    {},
    { slots: "lunes" },
    { slots: [{ weekDay: 0 }] },
    { slots: [{ weekDay: 0, hourBlock: 9, extra: true }] },
    { slots: [], extra: true },
  ])("rechaza un body con estructura inválida: %o", (body) => {
    expect(() => validateAvailabilityRequestDTO(body)).toThrow(ValidationError);
  });
});
