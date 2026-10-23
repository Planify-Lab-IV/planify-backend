import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

export const renameGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export type RenameGroupDTO = z.infer<typeof renameGroupSchema>;

export function validateRenameGroupDTO(input: unknown): RenameGroupDTO {
  const result = renameGroupSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return result.data;
}
