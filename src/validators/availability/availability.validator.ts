import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

const availabilitySlotSchema = z
  .object({
    weekDay: z.number(),
    hourBlock: z.number(),
  })
  .strict();

export const availabilityRequestSchema = z
  .object({
    slots: z.array(availabilitySlotSchema), // --> Que la carga horaria sea efectivamente una array
  })
  .strict();

export type AvailabilityRequestDTO = z.infer<typeof availabilityRequestSchema>;

export function validateAvailabilityRequestDTO(input: unknown): AvailabilityRequestDTO {
  const result = availabilityRequestSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("Los slots de disponibilidad son inválidos");
  }

  return result.data;
}
