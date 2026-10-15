import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ValueDifference } from "./lab4-client.js";
import type { KpiEnvironment, KpiMeasurement } from "./measurements.js";

export interface WriteKpiReportArtifactOptions {
  outputDirectory: string;
  executedAt: Date;
  day: string;
  environment: KpiEnvironment;
  runId: string;
  responseStatus: number | null;
  measurements: readonly KpiMeasurement[];
  valueDifferences: readonly ValueDifference[];
}

export interface KpiReportArtifact {
  executed_at: string;
  date: string;
  env: KpiEnvironment;
  run_id: string;
  response_status: number | null;
  measurements: readonly KpiMeasurement[];
  value_differences: readonly {
    kpi_id: string;
    sent_value: number;
    stored_value: number;
  }[];
}

export async function writeKpiReportArtifact({
  outputDirectory,
  executedAt,
  day,
  environment,
  runId,
  responseStatus,
  measurements,
  valueDifferences,
}: WriteKpiReportArtifactOptions): Promise<string> {
  if (!outputDirectory) {
    throw new Error("La carpeta de salida del artifact es requerida");
  }

  const artifact: KpiReportArtifact = {
    executed_at: executedAt.toISOString(),
    date: day,
    env: environment,
    run_id: runId,
    response_status: responseStatus,
    measurements,
    value_differences: valueDifferences.map((difference) => ({
      kpi_id: difference.kpiId,
      sent_value: difference.sentValue,
      stored_value: difference.storedValue,
    })),
  };
  const resolvedOutputDirectory = resolve(outputDirectory);
  const artifactPath = join(resolvedOutputDirectory, `kpi-report-${day}-${runId}.json`);

  await mkdir(resolvedOutputDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  return artifactPath;
}
