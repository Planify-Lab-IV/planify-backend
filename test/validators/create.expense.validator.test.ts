import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/shared/errors/index.js";
import { validateCreateExpenseDTO } from "../../src/validators/expense/create.expense.validator.js";

describe("validateCreateExpenseDTO", () => {
  const validBody = {
    description: "Cena",
    totalAmountCents: 4500,
    payers: [
      { participantId: "participant-ana", amountCents: 3000 },
      { participantId: "participant-beto", amountCents: 1500 },
    ],
    debtors: [
      { participantId: "participant-ana", amountCents: 1500 },
      { participantId: "participant-beto", amountCents: 1500 },
      { participantId: "participant-cami", amountCents: 1500 },
    ],
  };

  it("acepta un gasto con total, varios acreedores y varios deudores", () => {
    expect(validateCreateExpenseDTO(validBody)).toEqual(validBody);
  });

  it("normaliza espacios en la descripción y los identificadores", () => {
    expect(
      validateCreateExpenseDTO({
        ...validBody,
        description: "  Cena  ",
        payers: [{ participantId: "  participant-ana  ", amountCents: 4500 }],
        debtors: [{ participantId: "  participant-beto  ", amountCents: 4500 }],
      }),
    ).toEqual({
      ...validBody,
      payers: [{ participantId: "participant-ana", amountCents: 4500 }],
      debtors: [{ participantId: "participant-beto", amountCents: 4500 }],
    });
  });

  it.each([
    undefined,
    {},
    { ...validBody, description: " " },
    { ...validBody, totalAmountCents: 0 },
    { ...validBody, totalAmountCents: 12.5 },
    { ...validBody, payers: [] },
    { ...validBody, debtors: [] },
    { ...validBody, payers: [{ participantId: "participant-ana", amountCents: -1 }] },
    { ...validBody, debtors: [{ participantId: "", amountCents: 1 }] },
    { ...validBody, extra: true },
  ])("rechaza un body con estructura inválida: %o", (body) => {
    expect(() => validateCreateExpenseDTO(body)).toThrow(ValidationError);
  });
});
