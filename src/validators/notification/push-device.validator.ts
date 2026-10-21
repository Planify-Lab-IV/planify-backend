import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

const pushDeviceSchema = z.object({ pushToken: z.string().trim().min(1).max(4096) }).strict();

export type PushDeviceDTO = z.infer<typeof pushDeviceSchema>;

export function validatePushDeviceDTO(input: unknown): PushDeviceDTO {
  const result = pushDeviceSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("El body contiene campos inválidos");
  }
  return result.data;
}
