import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/shared/errors/index.js";
import { validateAttendanceResponseDTO } from "../../src/validators/participant/attendance.validator.js";

describe("validateAttendanceResponseDTO", () => {
  it.each(["confirmed", "rejected"])("acepta el estado %s", (state) => {
    expect(validateAttendanceResponseDTO({ state })).toEqual({ state });
  });

  it.each([
    { state: "not_confirmed" },
    { state: "maybe" },
    { state: "" },
    { state: null },
    {},
    { state: "confirmed", extra: true },
  ])("rechaza un body inválido: %o", (body) => {
    expect(() => validateAttendanceResponseDTO(body)).toThrow(ValidationError);
  });
});
