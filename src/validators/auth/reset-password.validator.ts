import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";
import { passwordSchema } from "./register.validator.js";

const resetPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    code: z.string().regex(/^\d{6}$/),
    newPassword: passwordSchema,
  })
  .strict();

export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;

export function validateResetPasswordDTO(input: unknown): ResetPasswordDTO {
  const result = resetPasswordSchema.safeParse(input);
  if (!result.success) throw new ValidationError("El body contiene campos inválidos");
  return result.data;
}
