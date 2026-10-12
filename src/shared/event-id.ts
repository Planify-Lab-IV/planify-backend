import { ValidationError } from "./errors/index.js";

export function validateEventId(eventId: unknown): asserts eventId is string {
  if (typeof eventId !== "string" || eventId.trim() === "") {
    throw new ValidationError("El eventId es requerido");
  }
}
