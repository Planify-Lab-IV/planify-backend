import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";
import { getArgentinaDay, getArgentinaDayRange } from "../../shared/time/argentina-date.js";

const kpiDayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function validateKpiDayQuery(query: unknown): string {
  const parsedQuery = kpiDayQuerySchema.safeParse(query);
  if (!parsedQuery.success) {
    throw new ValidationError("La fecha debe tener el formato YYYY-MM-DD");
  }

  const { date } = parsedQuery.data;
  try {
    getArgentinaDayRange(date);
  } catch {
    throw new ValidationError("La fecha debe ser un día de calendario válido");
  }

  if (date > getArgentinaDay()) {
    throw new ValidationError("La fecha no puede ser futura en Argentina");
  }

  return date;
}
