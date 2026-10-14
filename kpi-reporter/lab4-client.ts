import type { KpiId } from "./catalog.js";
import type { KpiMeasurement } from "./measurements.js";

const MEASUREMENTS_PATH = "/rest/v1/measurement";

export interface Lab4ClientOptions {
  supabaseUrl: string;
  supabasePublishableKey: string;
  projectKey: string;
  fetchImpl?: typeof fetch;
}

export interface Lab4Client {
  sendMeasurements(measurements: readonly KpiMeasurement[]): Promise<number>;
  verifyMeasurements(measurements: readonly KpiMeasurement[]): Promise<VerificationResult>;
}

export interface VerificationResult {
  valueDifferences: readonly ValueDifference[];
}

export interface ValueDifference {
  kpiId: KpiId;
  sentValue: number;
  storedValue: number;
}

interface StoredMeasurement {
  kpi_id: KpiId;
  value: number;
}

export function createLab4Client({
  supabaseUrl,
  supabasePublishableKey,
  projectKey,
  fetchImpl = fetch,
}: Lab4ClientOptions): Lab4Client {
  validateConfiguration({ supabaseUrl, supabasePublishableKey, projectKey });

  return {
    async sendMeasurements(measurements): Promise<number> {
      const url = createMeasurementsUrl(supabaseUrl);
      url.searchParams.set("on_conflict", "project_id,kpi_id,date,env");

      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          apikey: supabasePublishableKey,
          "Content-Type": "application/json",
          "X-Project-Key": projectKey,
          Prefer: "resolution=ignore-duplicates",
        },
        body: JSON.stringify(measurements),
      });

      if (!response.ok) {
        throw await createLab4ResponseError("enviar las mediciones", response);
      }

      return response.status;
    },

    async verifyMeasurements(measurements): Promise<VerificationResult> {
      const expectedMeasurements = new Map(
        measurements.map((measurement) => [measurement.kpi_id, measurement]),
      );
      const firstMeasurement = measurements[0];

      if (!firstMeasurement) {
        throw new Error("No se pueden verificar mediciones vacías");
      }

      const url = createMeasurementsUrl(supabaseUrl);
      url.searchParams.set("select", "kpi_id,value");
      url.searchParams.set("date", `eq.${firstMeasurement.date}`);
      url.searchParams.set("env", `eq.${firstMeasurement.env}`);
      url.searchParams.set("kpi_id", `in.(${[...expectedMeasurements.keys()].join(",")})`);

      const response = await fetchImpl(url, {
        headers: {
          apikey: supabasePublishableKey,
          "X-Project-Key": projectKey,
        },
      });

      if (!response.ok) {
        throw await createLab4ResponseError("verificar las mediciones", response);
      }

      const storedMeasurements = parseStoredMeasurements(
        await response.json(),
        expectedMeasurements,
      );
      const storedMeasurementsById = new Map(
        storedMeasurements.map((measurement) => [measurement.kpi_id, measurement]),
      );
      const missingKpiIds = [...expectedMeasurements.keys()].filter(
        (kpiId) => !storedMeasurementsById.has(kpiId),
      );

      if (missingKpiIds.length > 0) {
        throw new Error(`Lab4 no confirmó los KPIs enviados: ${missingKpiIds.join(", ")}`);
      }

      return {
        valueDifferences: storedMeasurements.flatMap((storedMeasurement) => {
          const sentMeasurement = expectedMeasurements.get(storedMeasurement.kpi_id);

          if (!sentMeasurement || sentMeasurement.value === storedMeasurement.value) {
            return [];
          }

          return [
            {
              kpiId: storedMeasurement.kpi_id,
              sentValue: sentMeasurement.value,
              storedValue: storedMeasurement.value,
            },
          ];
        }),
      };
    },
  };
}

function validateConfiguration({
  supabaseUrl,
  supabasePublishableKey,
  projectKey,
}: Omit<Lab4ClientOptions, "fetchImpl">): void {
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL es requerida para enviar KPIs a Lab4");
  }

  if (!supabasePublishableKey) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY es requerida para enviar KPIs a Lab4");
  }

  if (!projectKey) {
    throw new Error("PROJECT_KEY es requerida para enviar KPIs a Lab4");
  }
}

function createMeasurementsUrl(supabaseUrl: string): URL {
  return new URL(MEASUREMENTS_PATH, supabaseUrl);
}

async function createLab4ResponseError(action: string, response: Response): Promise<Error> {
  const responseBody = await response.text();
  return new Error(
    `Lab4 no pudo ${action}: HTTP ${response.status}${responseBody ? ` ${responseBody}` : ""}`,
  );
}

function parseStoredMeasurements(
  payload: unknown,
  expectedMeasurements: ReadonlyMap<KpiId, KpiMeasurement>,
): StoredMeasurement[] {
  if (!Array.isArray(payload)) {
    throw new Error("Lab4 devolvió mediciones con un formato inválido");
  }

  return payload.map((measurement) => {
    if (
      !isRecord(measurement) ||
      typeof measurement.kpi_id !== "string" ||
      !expectedMeasurements.has(measurement.kpi_id as KpiId) ||
      typeof measurement.value !== "number" ||
      !Number.isFinite(measurement.value)
    ) {
      throw new Error("Lab4 devolvió mediciones con un formato inválido");
    }

    return { kpi_id: measurement.kpi_id as KpiId, value: measurement.value };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
