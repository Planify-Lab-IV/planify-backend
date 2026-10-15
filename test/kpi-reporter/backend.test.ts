import { describe, expect, it, vi } from "vitest";
import { fetchBackendKpis } from "../../kpi-reporter/sources/backend.js";

const apiUrl = "http://planify.example";
const internalKpisToken = "token-interno-de-prueba";
const backendKpis = {
  events_created_month_to_date: 12,
  events_with_multiple_participants_count: 8,
  events_with_activity_count: 5,
  http_requests: 120,
  http_5xx_responses: 2,
  http_response_time_total_ms: 4500,
};

describe("fuente de KPIs del backend", () => {
  it("consulta el día argentino con el token interno", async () => {
    const fetchImpl = createFetch(backendKpis);

    await expect(
      fetchBackendKpis({
        apiUrl,
        internalKpisToken,
        now: new Date("2026-10-14T00:15:00.000Z"),
        fetchImpl,
      }),
    ).resolves.toEqual(backendKpis);

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://planify.example/internal/kpis?date=2026-10-13"),
      { headers: { "X-Internal-Token": internalKpisToken } },
    );
  });

  it("falla si el backend rechaza la consulta", async () => {
    const fetchImpl = createFetch(new Response("unauthorized", { status: 401 }));

    await expect(fetchBackendKpis({ apiUrl, internalKpisToken, fetchImpl })).rejects.toThrow(
      "HTTP 401 unauthorized",
    );
  });

  it.each([
    { ...backendKpis, http_requests: -1 },
    {
      events_created_month_to_date: 12,
      events_with_multiple_participants_count: 8,
      events_with_activity_count: 5,
      http_requests: 120,
      http_5xx_responses: 2,
    },
  ])("falla si el backend devuelve un KPI faltante o inválido", async (payload) => {
    const fetchImpl = createFetch(payload);

    await expect(fetchBackendKpis({ apiUrl, internalKpisToken, fetchImpl })).rejects.toThrow(
      "formato inválido",
    );
  });
});

function createFetch(payload: unknown): typeof fetch {
  return vi.fn(async () => {
    if (payload instanceof Response) {
      return payload;
    }

    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}
