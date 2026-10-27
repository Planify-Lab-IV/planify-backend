import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/shared/errors/index.js";
import { validateAddGroupMemberDTO } from "../../src/validators/group/add.group.member.validator.js";

describe("validateAddGroupMemberDTO", () => {
  it("accepts a user id and trims surrounding whitespace", () => {
    expect(validateAddGroupMemberDTO({ userId: "  user-2  " })).toEqual({ userId: "user-2" });
  });

  it.each([
    undefined,
    {},
    { userId: "" },
    { userId: "   " },
    { userId: 42 },
    { userId: "user-2", extra: true },
  ])("rejects an invalid body: %o", (body) => {
    expect(() => validateAddGroupMemberDTO(body)).toThrow(ValidationError);
  });
});
