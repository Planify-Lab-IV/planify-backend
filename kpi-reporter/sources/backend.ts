import { getArgentinaDay } from "../../src/shared/time/argentina-date.js";

export interface BackendKpis {
  events_created_month_to_date: number;
  events_with_multiple_participants_count: number;
  events_with_activity_count: number;
  http_requests: number;
  http_5xx_responses: number;
  http_response_time_total_ms: number;
}

export interface FetchBackendKpisOptions {
  apiUrl: string;
  internalKpisToken: string;
  day?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

const BACKEND_KPI_IDS = [
  "events_created_month_to_date",
  "events_with_multiple_participants_count",
  "events_with_activity_count",
  "http_requests",
  "http_5xx_responses",
  "http_response_time_total_ms",
] as const;

export async function fetchBackendKpis({
  apiUrl,
  internalKpisToken,
  day,
  now = new Date(),
  fetchImpl = fetch,
}: FetchBackendKpisOptions): Promise<BackendKpis> {
  if (!apiUrl) {
    throw new Error("PLANIFY_API_URL es requerida para consultar los KPIs internos");
  }

  if (!internalKpisToken) {
    throw new Error("INTERNAL_KPIS_TOKEN es requerido para consultar los KPIs internos");
  }

  const url = new URL("/internal/kpis", apiUrl);
  url.searchParams.set("date", day ?? getArgentinaDay(now));

  const response = await fetchImpl(url, {
    headers: { "X-Internal-Token": internalKpisToken },
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `No se pudieron consultar los KPIs internos: HTTP ${response.status}${responseBody ? ` ${responseBody}` : ""}`,
    );
  }

  return parseBackendKpis(await response.json());
}

function parseBackendKpis(payload: unknown): BackendKpis {
  if (!isBackendKpis(payload)) {
    throw new Error("El backend devolvió KPIs internos con un formato inválido");
  }

  return payload;
}

function isBackendKpis(value: unknown): value is BackendKpis {
  return isRecord(value) && BACKEND_KPI_IDS.every((kpiId) => isNonNegativeInteger(value[kpiId]));
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
