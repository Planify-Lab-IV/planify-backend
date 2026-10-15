import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { writeKpiReportArtifact } from "./artifact.js";
import type { KpiId, KpiSource } from "./catalog.js";
import { getArgentinaDay, getArgentinaDayRange } from "../src/shared/time/argentina-date.js";
import { createLab4Client, type ValueDifference } from "./lab4-client.js";
import type {
  FailedKpiSourceResult,
  KpiEnvironment,
  KpiMeasurement,
  KpiSourceResult,
  KpiValues,
} from "./measurements.js";
import { fetchBackendKpis } from "./sources/backend.js";
import { fetchCiKpis } from "./sources/github-actions.js";
import { measureHealthKpis } from "./sources/health.js";
import { validateMeasurementBatch } from "./validation.js";

type ReportEnvironment = Exclude<KpiEnvironment, "qa">;

export interface KpiReportOptions {
  apiUrl: string;
  internalKpisToken: string;
  githubToken: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  projectKey: string;
  environment: ReportEnvironment;
  day?: string;
  now?: Date;
  outputDirectory?: string;
  dependencies?: Partial<KpiReporterDependencies>;
}

export interface KpiReportResult {
  day: string;
  runId: string;
  responseStatus: number;
  artifactPath: string;
  measurementCount: number;
}

export interface KpiReporterDependencies {
  fetchBackendKpis: typeof fetchBackendKpis;
  fetchCiKpis: typeof fetchCiKpis;
  measureHealthKpis: typeof measureHealthKpis;
  createLab4Client: typeof createLab4Client;
  writeKpiReportArtifact: typeof writeKpiReportArtifact;
  createRunId: () => string;
  warn: (message: string) => void;
}

const defaultDependencies: KpiReporterDependencies = {
  fetchBackendKpis,
  fetchCiKpis,
  measureHealthKpis,
  createLab4Client,
  writeKpiReportArtifact,
  createRunId: randomUUID,
  warn: (message) => console.warn(message),
};

export async function runKpiReport({
  apiUrl,
  internalKpisToken,
  githubToken,
  supabaseUrl,
  supabasePublishableKey,
  projectKey,
  environment,
  day: requestedDay,
  now = new Date(),
  outputDirectory = "kpi-reporter/output",
  dependencies: customDependencies,
}: KpiReportOptions): Promise<KpiReportResult> {
  const dependencies = { ...defaultDependencies, ...customDependencies };
  const currentArgentinaDay = getArgentinaDay(now);
  const day = resolveReportDay(requestedDay ?? currentArgentinaDay, currentArgentinaDay);
  const runId = dependencies.createRunId();
  const sourceResults = await Promise.all([
    readSource("backend", () =>
      dependencies.fetchBackendKpis({ apiUrl, internalKpisToken, day, now }),
    ),
    readSource("github-actions", () => dependencies.fetchCiKpis({ githubToken, now })),
    readSource("health-probe", () => dependencies.measureHealthKpis({ apiUrl })),
  ]);
  const measurements = createMeasurements(sourceResults, { day, environment, runId });
  const sourceFailures = sourceResults.filter(isFailedSourceResult);
  let responseStatus: number | null = null;
  let valueDifferences: readonly ValueDifference[] = [];
  let reportError: Error | undefined;

  if (measurements.length === 0) {
    reportError = new Error("Ninguna fuente entregó mediciones para enviar a Lab4");
  } else {
    try {
      validateMeasurementBatch(measurements, {
        day,
        environment,
        runId,
        mode: sourceFailures.length > 0 ? "partial" : "complete",
      });

      const lab4Client = dependencies.createLab4Client({
        supabaseUrl,
        supabasePublishableKey,
        projectKey,
      });
      responseStatus = await lab4Client.sendMeasurements(measurements);
      valueDifferences = (await lab4Client.verifyMeasurements(measurements)).valueDifferences;

      for (const difference of valueDifferences) {
        dependencies.warn(
          `Lab4 conservó ${difference.kpiId}=${difference.storedValue} en lugar de ${difference.sentValue}`,
        );
      }
    } catch (error) {
      reportError = toError(error);
    }
  }

  const artifactPath = await dependencies.writeKpiReportArtifact({
    outputDirectory,
    executedAt: now,
    day,
    environment,
    runId,
    responseStatus,
    measurements,
    valueDifferences,
  });

  if (reportError) {
    throw reportError;
  }

  if (sourceFailures.length > 0) {
    throw new AggregateError(
      sourceFailures.map((result) => result.error),
      `Fallaron las fuentes de KPIs: ${sourceFailures.map((result) => result.source).join(", ")}`,
    );
  }

  return {
    day,
    runId,
    responseStatus,
    artifactPath,
    measurementCount: measurements.length,
  };
}

export function readKpiReportConfig(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): KpiReportOptions {
  const targetEnvironment = requireEnvironmentVariable(environmentVariables, "KPI_TARGET_ENV");

  if (targetEnvironment !== "dev" && targetEnvironment !== "prod") {
    throw new Error("KPI_TARGET_ENV debe ser dev o prod");
  }

  const requestedDay = environmentVariables.KPI_REPORT_DATE;

  return {
    apiUrl: requireEnvironmentVariable(environmentVariables, "PLANIFY_API_URL"),
    internalKpisToken: requireEnvironmentVariable(environmentVariables, "INTERNAL_KPIS_TOKEN"),
    githubToken: requireEnvironmentVariable(environmentVariables, "GITHUB_TOKEN"),
    supabaseUrl: requireEnvironmentVariable(environmentVariables, "SUPABASE_URL"),
    supabasePublishableKey: requireEnvironmentVariable(
      environmentVariables,
      "SUPABASE_PUBLISHABLE_KEY",
    ),
    projectKey: requireEnvironmentVariable(environmentVariables, "PROJECT_KEY"),
    environment: targetEnvironment,
    outputDirectory: environmentVariables.KPI_REPORT_OUTPUT_DIR || "kpi-reporter/output",
    ...(requestedDay ? { day: requestedDay } : {}),
  };
}

function resolveReportDay(day: string, currentArgentinaDay: string): string {
  getArgentinaDayRange(day);

  if (day > currentArgentinaDay) {
    throw new RangeError("La fecha del reporte no puede ser futura en Argentina");
  }

  return day;
}

async function readSource<T extends object>(
  source: KpiSource,
  load: () => Promise<T>,
): Promise<KpiSourceResult> {
  try {
    const values = await load();
    return { source, status: "success", values: { ...values } as KpiValues };
  } catch (error) {
    return { source, status: "failure", error: toError(error) };
  }
}

function createMeasurements(
  sourceResults: readonly KpiSourceResult[],
  {
    day,
    environment,
    runId,
  }: Pick<KpiReportOptions, "environment"> & { day: string; runId: string },
): KpiMeasurement[] {
  return sourceResults.flatMap((result) => {
    if (result.status === "failure") {
      return [];
    }

    return Object.entries(result.values).map(([kpiId, value]) => ({
      kpi_id: kpiId as KpiId,
      value,
      date: day,
      env: environment,
      run_id: runId,
    }));
  });
}

function isFailedSourceResult(result: KpiSourceResult): result is FailedKpiSourceResult {
  return result.status === "failure";
}

function requireEnvironmentVariable(environmentVariables: NodeJS.ProcessEnv, name: string): string {
  const value = environmentVariables[name];

  if (!value) {
    throw new Error(`${name} es requerida para ejecutar el reporter de KPIs`);
  }

  return value;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

async function main(): Promise<void> {
  const result = await runKpiReport(readKpiReportConfig());
  console.log(
    `Reporte de KPIs completado: ${result.measurementCount} mediciones para ${result.day}. Artifact: ${result.artifactPath}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(toError(error));
    process.exitCode = 1;
  });
}
