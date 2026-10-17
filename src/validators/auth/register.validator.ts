import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

const MAX_PASSWORD_BYTES = 72;

export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine((password) => password.trim().length > 0)
  .refine((password) => Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES);

export const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,30}$/),
    email: z.string().trim().toLowerCase().email(),
    password: passwordSchema,
  })
  .strict();

export type RegisterDTO = z.infer<typeof registerSchema>;

export function validateRegisterDTO(input: unknown): RegisterDTO {
  const result = registerSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return result.data;
}
