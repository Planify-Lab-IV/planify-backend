import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/shared/errors/index.js";
import { validateRenameGroupDTO } from "../../src/validators/group/rename.group.validator.js";

describe("validateRenameGroupDTO", () => {
  it("accepts a group name and trims surrounding whitespace", () => {
    expect(validateRenameGroupDTO({ name: "  Amigos del barrio  " })).toEqual({
      name: "Amigos del barrio",
    });
  });

  it("accepts a name with exactly 80 characters", () => {
    expect(validateRenameGroupDTO({ name: "a".repeat(80) })).toEqual({ name: "a".repeat(80) });
  });

  it.each([
    undefined,
    {},
    { name: "" },
    { name: "   " },
    { name: "a".repeat(81) },
    { name: 42 },
    { name: "Amigos", extra: true },
  ])("rejects an invalid body: %o", (body) => {
    expect(() => validateRenameGroupDTO(body)).toThrow(ValidationError);
  });
});
