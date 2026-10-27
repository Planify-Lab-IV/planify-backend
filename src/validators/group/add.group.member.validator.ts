import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

export const addGroupMemberSchema = z
  .object({
    userId: z.string().trim().min(1),
  })
  .strict();

export type AddGroupMemberDTO = z.infer<typeof addGroupMemberSchema>;

export function validateAddGroupMemberDTO(input: unknown): AddGroupMemberDTO {
  const result = addGroupMemberSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return result.data;
}
