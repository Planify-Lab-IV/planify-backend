import { describe, expect, it, vi } from "vitest";
import type { Lab4Client } from "../../kpi-reporter/lab4-client.js";
import { readKpiReportConfig, runKpiReport } from "../../kpi-reporter/report.js";

const now = new Date("2026-10-15T00:15:00.000Z");
const runId = "8e45ab89-d1f7-4e15-98a4-ff58d433696f";

describe("ejecución del reporter de KPIs", () => {
  it("envía y verifica los diez KPIs cuando responden todas las fuentes", async () => {
    const testSetup = createTestSetup();

    await expect(runKpiReport(testSetup.options)).resolves.toMatchObject({
      day: "2026-10-14",
      runId,
      responseStatus: 201,
      artifactPath: "/tmp/kpi-report.json",
      measurementCount: 10,
    });

    expect(testSetup.lab4Client.sendMeasurements).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ kpi_id: "events_created_month_to_date", run_id: runId }),
        expect.objectContaining({ kpi_id: "ci_runs_last_7_days", run_id: runId }),
        expect.objectContaining({ kpi_id: "health_checks_total", run_id: runId }),
      ]),
    );
    expect(testSetup.lab4Client.sendMeasurements.mock.calls[0]?.[0]).toHaveLength(10);
    expect(testSetup.writeArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ responseStatus: 201, measurements: expect.any(Array) }),
    );
  });

  it("publica las fuentes disponibles, guarda el artifact y falla si una fuente no responde", async () => {
    const testSetup = createTestSetup({ backendError: new Error("backend unavailable") });

    await expect(runKpiReport(testSetup.options)).rejects.toThrow(
      "Fallaron las fuentes de KPIs: backend",
    );

    expect(testSetup.lab4Client.sendMeasurements.mock.calls[0]?.[0]).toHaveLength(4);
    expect(testSetup.writeArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ responseStatus: 201 }),
    );
  });

  it("no publica si la validación detecta valores incoherentes", async () => {
    const testSetup = createTestSetup({
      backendValues: { http_requests: 1, http_5xx_responses: 2 },
    });

    await expect(runKpiReport(testSetup.options)).rejects.toThrow(
      "http_5xx_responses no puede superar a http_requests",
    );

    expect(testSetup.lab4Client.sendMeasurements).not.toHaveBeenCalled();
    expect(testSetup.writeArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ responseStatus: null }),
    );
  });

  it("rechaza configuraciones sin variables requeridas o con un ambiente no publicable", () => {
    expect(() => readKpiReportConfig({ KPI_TARGET_ENV: "qa" })).toThrow("debe ser dev o prod");
    expect(() => readKpiReportConfig({ KPI_TARGET_ENV: "dev" })).toThrow("PLANIFY_API_URL");
  });
});

function createTestSetup({
  backendError,
  backendValues,
}: {
  backendError?: Error;
  backendValues?: Partial<{ http_requests: number; http_5xx_responses: number }>;
} = {}) {
  const lab4Client: Lab4Client & {
    sendMeasurements: ReturnType<typeof vi.fn>;
    verifyMeasurements: ReturnType<typeof vi.fn>;
  } = {
    sendMeasurements: vi.fn(async () => 201),
    verifyMeasurements: vi.fn(async () => ({ valueDifferences: [] })),
  };
  const writeArtifact = vi.fn(async () => "/tmp/kpi-report.json");
  const fetchBackendKpis = vi.fn(async () => {
    if (backendError) {
      throw backendError;
    }

    return {
      events_created_month_to_date: 8,
      events_with_multiple_participants_count: 3,
      events_with_activity_count: 5,
      http_requests: backendValues?.http_requests ?? 20,
      http_5xx_responses: backendValues?.http_5xx_responses ?? 2,
      http_response_time_total_ms: 1500,
    };
  });

  return {
    lab4Client,
    writeArtifact,
    options: {
      apiUrl: "http://planify.example",
      internalKpisToken: "internal-token",
      githubToken: "github-token",
      supabaseUrl: "https://lab4.example",
      supabasePublishableKey: "publishable-key",
      projectKey: "project-key",
      environment: "dev" as const,
      now,
      dependencies: {
        fetchBackendKpis: fetchBackendKpis as never,
        fetchCiKpis: vi.fn(async () => ({
          ci_runs_last_7_days: 10,
          ci_successful_runs_last_7_days: 8,
        })) as never,
        measureHealthKpis: vi.fn(async () => ({
          health_checks_total: 10,
          health_checks_successful: 9,
        })) as never,
        createLab4Client: vi.fn(() => lab4Client) as never,
        writeKpiReportArtifact: writeArtifact as never,
        createRunId: () => runId,
        warn: vi.fn(),
      },
    },
  };
}
