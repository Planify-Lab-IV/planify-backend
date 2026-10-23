import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email() }).strict();

export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;

export function validateForgotPasswordDTO(input: unknown): ForgotPasswordDTO {
  const result = forgotPasswordSchema.safeParse(input);
  if (!result.success) throw new ValidationError("El body contiene campos inválidos");
  return result.data;
}
