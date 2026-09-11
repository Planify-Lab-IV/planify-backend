import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

export const createEventSchema = z
  .object({
    name: z.string(),
    location: z.string().trim().min(1),
    groupId: z.string().optional(),
    newGroupName: z.string().optional(),
    memberIdentifiers: z.array(z.string()).optional(),
  })
  .strict();

export type CreateEventDTO = z.infer<typeof createEventSchema>;

export const confirmScheduleSchema = z
  .object({
    startDateTime: z.string().datetime({ offset: true }), // --> offset entre UTC y hora local
  })
  .strict();

export type ConfirmScheduleDTO = z.infer<typeof confirmScheduleSchema>;

export function validateCreateEventDTO(input: unknown): CreateEventDTO {
  const result = createEventSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return result.data;
}

export function validateConfirmScheduleDTO(input: unknown): ConfirmScheduleDTO {
  const result = confirmScheduleSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return result.data;
}
