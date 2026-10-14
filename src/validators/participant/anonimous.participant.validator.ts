import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

const PIN_LENGTH = 4;

export const anonymousParticipantSchema = z
  .object({
    // --> El nombre debe ser de entre 1 y 80 caracteres
    name: z.string().trim().min(1).max(80),
    // --> un digito repetido PIN_LENGTH veces para el pinHash
    pin: z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`)),
  })
  .strict(); // --> Rechaza las claves no previstas

export type AnonymousParticipantDTO = z.infer<typeof anonymousParticipantSchema>;

export function validateAnonymousParticipantDTO(input: unknown): AnonymousParticipantDTO {
  const result = anonymousParticipantSchema.safeParse(input);
  // --> success si cumple con las validaciones y contiene las claves previstas

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return result.data;
}
