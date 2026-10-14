import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

const expenseShareSchema = z
  .object({
    participantId: z.string().trim().min(1),
    amountCents: z.number().int().positive(),
  })
  .strict();

export const createExpenseSchema = z
  .object({
    description: z.string().trim().min(1),
    totalAmountCents: z.number().int().positive(),
    payers: z.array(expenseShareSchema).min(1),
    debtors: z.array(expenseShareSchema).min(1),
  })
  .strict();

export type CreateExpenseDTO = z.infer<typeof createExpenseSchema>;

export function validateCreateExpenseDTO(input: unknown): CreateExpenseDTO {
  const result = createExpenseSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return result.data;
}
