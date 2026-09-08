import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

const createInvitationSchema = z
  .object({
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export interface CreateInvitationDTO {
  expiresAt: Date | null;
}

export function validateCreateInvitationDTO(input: unknown): CreateInvitationDTO {
  const result = createInvitationSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return {
    expiresAt: result.data.expiresAt ? new Date(result.data.expiresAt) : null,
  };
}
