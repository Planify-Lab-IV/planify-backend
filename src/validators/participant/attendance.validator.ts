import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

export const attendanceResponseStates = ["confirmed", "rejected"] as const;

export const attendanceResponseSchema = z
  .object({ state: z.enum(attendanceResponseStates) }) // --> not_confirmed no es válido
  .strict();

export type AttendanceResponseDTO = z.infer<typeof attendanceResponseSchema>;

export function validateAttendanceResponseDTO(input: unknown): AttendanceResponseDTO {
  const result = attendanceResponseSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("El estado de asistencia es inválido");
  }

  return result.data;
}
