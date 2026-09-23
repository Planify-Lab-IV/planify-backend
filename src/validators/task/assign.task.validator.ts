import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

export const assignTaskSchema = z
  .object({
    participantId: z.string().trim().min(1),
  })
  .strict();

export type AssignTaskDTO = z.infer<typeof assignTaskSchema>;

export function validateAssignTaskDTO(input: unknown): AssignTaskDTO {
  const result = assignTaskSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos invÃ¡lidos");
  }

  return result.data;
}
