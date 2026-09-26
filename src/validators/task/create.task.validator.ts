import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1),
  })
  .strict();

export type CreateTaskDTO = z.infer<typeof createTaskSchema>;

export function validateCreateTaskDTO(input: unknown): CreateTaskDTO {
  const result = createTaskSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }

  return result.data;
}
