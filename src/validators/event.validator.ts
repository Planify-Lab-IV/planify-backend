import { z } from "zod";
import { ValidationError } from "../shared/errors/index.js";

export const createEventSchema = z
  .object({
    nombre: z.string(),
    textPlace: z.string().optional(),
    grupoId: z.string().optional(),
    nuevoGrupoNombre: z.string().optional(),
    memberIdentifiers: z.array(z.string()).optional(),
  })
  .strict();

export type CreateEventDTO = z.infer<typeof createEventSchema>;

export function validateCreateEventDTO(input: unknown): CreateEventDTO {
  const result = createEventSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return result.data;
}
