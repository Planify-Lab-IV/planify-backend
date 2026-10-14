import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeKpiReportArtifact } from "../../kpi-reporter/artifact.js";

let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "planify-kpi-artifact-"));
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("artifact del reporte de KPIs", () => {
  it("guarda el payload y sus metadatos sin secretos", async () => {
    const artifactPath = await writeKpiReportArtifact({
      outputDirectory: join(temporaryDirectory, "output"),
      executedAt: new Date("2026-10-15T00:15:00.000Z"),
      day: "2026-10-14",
      environment: "dev",
      runId: "8e45ab89-d1f7-4e15-98a4-ff58d433696f",
      responseStatus: 201,
      measurements: [
        {
          kpi_id: "http_requests",
          value: 20,
          date: "2026-10-14",
          env: "dev",
          run_id: "8e45ab89-d1f7-4e15-98a4-ff58d433696f",
        },
      ],
      valueDifferences: [{ kpiId: "http_requests", sentValue: 20, storedValue: 18 }],
    });

    const content = await readFile(artifactPath, "utf8");

    expect(JSON.parse(content)).toEqual({
      executed_at: "2026-10-15T00:15:00.000Z",
      date: "2026-10-14",
      env: "dev",
      run_id: "8e45ab89-d1f7-4e15-98a4-ff58d433696f",
      response_status: 201,
      measurements: [
        {
          kpi_id: "http_requests",
          value: 20,
          date: "2026-10-14",
          env: "dev",
          run_id: "8e45ab89-d1f7-4e15-98a4-ff58d433696f",
        },
      ],
      value_differences: [{ kpi_id: "http_requests", sent_value: 20, stored_value: 18 }],
    });
    expect(content).not.toContain("project-key");
    expect(content).not.toContain("internal-kpis-token");
  });

  it("rechaza una carpeta de salida vacía", async () => {
    await expect(
      writeKpiReportArtifact({
        outputDirectory: "",
        executedAt: new Date(),
        day: "2026-10-14",
        environment: "dev",
        runId: "8e45ab89-d1f7-4e15-98a4-ff58d433696f",
        responseStatus: null,
        measurements: [],
        valueDifferences: [],
      }),
    ).rejects.toThrow("carpeta de salida");
  });
});
