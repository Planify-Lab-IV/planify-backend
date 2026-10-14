import { describe, expect, it, vi } from "vitest";
import { createLab4Client } from "../../kpi-reporter/lab4-client.js";
import type { KpiMeasurement } from "../../kpi-reporter/measurements.js";

const supabaseUrl = "https://lab4.example";
const supabasePublishableKey = "publishable-key";
const projectKey = "project-key";
const measurements: readonly KpiMeasurement[] = [
  {
    kpi_id: "http_requests",
    value: 20,
    date: "2026-10-14",
    env: "dev",
    run_id: "8e45ab89-d1f7-4e15-98a4-ff58d433696f",
  },
  {
    kpi_id: "http_5xx_responses",
    value: 2,
    date: "2026-10-14",
    env: "dev",
    run_id: "8e45ab89-d1f7-4e15-98a4-ff58d433696f",
  },
];

describe("cliente de Lab4 KPIs", () => {
  it("envía el lote con resolución idempotente de duplicados", async () => {
    const fetchImpl = createFetch(new Response(null, { status: 201 }));
    const client = createClient(fetchImpl);

    await expect(client.sendMeasurements(measurements)).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(
        "https://lab4.example/rest/v1/measurement?on_conflict=project_id%2Ckpi_id%2Cdate%2Cenv",
      ),
      {
        method: "POST",
        headers: {
          apikey: supabasePublishableKey,
          "Content-Type": "application/json",
          "X-Project-Key": projectKey,
          Prefer: "resolution=ignore-duplicates",
        },
        body: JSON.stringify(measurements),
      },
    );
  });

  it("expone el cuerpo de error de Lab4 sin incluir secretos", async () => {
    const fetchImpl = createFetch(new Response("invalid payload", { status: 400 }));
    const client = createClient(fetchImpl);

    await expect(client.sendMeasurements(measurements)).rejects.toThrow("HTTP 400 invalid payload");
  });

  it("verifica las mediciones y avisa valores conservados de una corrida previa", async () => {
    const fetchImpl = createFetch([
      { kpi_id: "http_requests", value: 18 },
      { kpi_id: "http_5xx_responses", value: 2 },
    ]);
    const client = createClient(fetchImpl);

    await expect(client.verifyMeasurements(measurements)).resolves.toEqual({
      valueDifferences: [{ kpiId: "http_requests", sentValue: 20, storedValue: 18 }],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(
        "https://lab4.example/rest/v1/measurement?select=kpi_id%2Cvalue&date=eq.2026-10-14&env=eq.dev&kpi_id=in.%28http_requests%2Chttp_5xx_responses%29",
      ),
      {
        headers: {
          apikey: supabasePublishableKey,
          "X-Project-Key": projectKey,
        },
      },
    );
  });

  it("falla si Lab4 no confirma todos los KPIs enviados", async () => {
    const fetchImpl = createFetch([{ kpi_id: "http_requests", value: 20 }]);
    const client = createClient(fetchImpl);

    await expect(client.verifyMeasurements(measurements)).rejects.toThrow("http_5xx_responses");
  });

  it("falla si faltan credenciales de Lab4", () => {
    expect(() => createLab4Client({ supabaseUrl, supabasePublishableKey, projectKey: "" })).toThrow(
      "PROJECT_KEY",
    );
  });
});

function createClient(fetchImpl: typeof fetch) {
  return createLab4Client({ supabaseUrl, supabasePublishableKey, projectKey, fetchImpl });
}

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
