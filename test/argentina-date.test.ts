import { describe, expect, it } from "vitest";
import { getArgentinaDay, getArgentinaDayRange } from "../src/shared/time/argentina-date.js";

describe("Argentina date utilities", () => {
  it("obtiene el día anterior en Argentina a las 00:15 UTC", () => {
    expect(getArgentinaDay(new Date("2026-10-13T00:15:00.000Z"))).toBe("2026-10-12");
  });

  it("devuelve límites UTC inclusivo-exclusivo para un día argentino", () => {
    const range = getArgentinaDayRange("2026-10-12");

    expect(range.startUtc.toISOString()).toBe("2026-10-12T03:00:00.000Z");
    expect(range.endUtc.toISOString()).toBe("2026-10-13T03:00:00.000Z");
  });

  it("rechaza días inválidos", () => {
    expect(() => getArgentinaDayRange("2026-02-30")).toThrow(RangeError);
    expect(() => getArgentinaDayRange("12-10-2026")).toThrow(RangeError);
  });

  it("rechaza instantes inválidos", () => {
    expect(() => getArgentinaDay(new Date("invalid"))).toThrow(RangeError);
  });
});
