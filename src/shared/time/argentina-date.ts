export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

export interface ArgentinaDayRange {
  startUtc: Date;
  endUtc: Date;
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ARGENTINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getArgentinaDay(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("La fecha debe ser válida");
  }

  const parts = dayFormatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function getArgentinaDayRange(day: string): ArgentinaDayRange {
  const { year, month, date } = parseDay(day);
  const nextDay = new Date(Date.UTC(year, month - 1, date + 1));

  return {
    startUtc: findStartOfArgentinaDay(day),
    endUtc: findStartOfArgentinaDay(formatUtcDay(nextDay)),
  };
}

function parseDay(day: string): { year: number; month: number; date: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    throw new RangeError("El día debe tener el formato YYYY-MM-DD");
  }

  const [, yearText, monthText, dateText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const date = Number(dateText);
  const candidate = new Date(Date.UTC(year, month - 1, date));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== date
  ) {
    throw new RangeError("El día debe ser una fecha de calendario válida");
  }

  return { year, month, date };
}

function findStartOfArgentinaDay(day: string): Date {
  const { year, month, date } = parseDay(day);
  const utcMidnight = Date.UTC(year, month - 1, date);
  let lowerBound = utcMidnight - 36 * 60 * 60 * 1000;
  let upperBound = utcMidnight + 36 * 60 * 60 * 1000;

  while (lowerBound < upperBound) {
    const middle = lowerBound + Math.floor((upperBound - lowerBound) / 2);

    if (getArgentinaDay(new Date(middle)) < day) {
      lowerBound = middle + 1;
    } else {
      upperBound = middle;
    }
  }

  const start = new Date(lowerBound);
  if (getArgentinaDay(start) !== day) {
    throw new RangeError(`No se pudo resolver el inicio del día argentino ${day}`);
  }

  return start;
}

function formatUtcDay(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
