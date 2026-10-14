import { KPI_CATALOG, KPI_IDS, type KpiId, type KpiSource } from "./catalog.js";
import type { KpiEnvironment, KpiMeasurement } from "./measurements.js";
import { getArgentinaDayRange } from "../src/shared/time/argentina-date.js";

export type MeasurementBatchMode = "complete" | "partial";

export interface MeasurementBatchValidationOptions {
  day: string;
  environment: KpiEnvironment;
  runId: string;
  mode?: MeasurementBatchMode;
}

const KPI_SOURCES = [...new Set(KPI_CATALOG.map((kpi) => kpi.source))] as readonly KpiSource[];

const KPI_IDS_BY_SOURCE = new Map<KpiSource, readonly KpiId[]>(
  KPI_SOURCES.map((source) => [
    source,
    KPI_CATALOG.filter((kpi) => kpi.source === source).map((kpi) => kpi.id),
  ]),
);

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateMeasurementBatch(
  measurements: readonly KpiMeasurement[],
  { day, environment, runId, mode = "complete" }: MeasurementBatchValidationOptions,
): void {
  validateBatchMetadata(day, environment, runId);

  if (measurements.length === 0) {
    throw new Error("El lote de KPIs no puede estar vacío");
  }

  const measurementsById = new Map<KpiId, KpiMeasurement>();

  for (const measurement of measurements) {
    validateMeasurement(measurement, { day, environment, runId });

    if (measurementsById.has(measurement.kpi_id)) {
      throw new Error(`El lote de KPIs repite ${measurement.kpi_id}`);
    }

    measurementsById.set(measurement.kpi_id, measurement);
  }

  if (mode === "complete") {
    validateCompleteKpiIds(measurementsById);
  } else {
    validatePartialSourceGroups(measurementsById);
  }

  validateRelatedValues(measurementsById);
}

function validateBatchMetadata(day: string, environment: KpiEnvironment, runId: string): void {
  if (!isValidDay(day)) {
    throw new Error("La fecha del lote de KPIs no es válida");
  }

  if (!isKpiEnvironment(environment)) {
    throw new Error("El ambiente del lote de KPIs no es válido");
  }

  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("El run_id del lote de KPIs no es válido");
  }
}

function validateMeasurement(
  measurement: KpiMeasurement,
  { day, environment, runId }: Omit<MeasurementBatchValidationOptions, "mode">,
): void {
  if (!KPI_IDS.includes(measurement.kpi_id)) {
    throw new Error(`El lote de KPIs contiene un ID desconocido: ${measurement.kpi_id}`);
  }

  if (!isNonNegativeInteger(measurement.value)) {
    throw new Error(`El KPI ${measurement.kpi_id} tiene un valor inválido`);
  }

  if (measurement.date !== day) {
    throw new Error(`El KPI ${measurement.kpi_id} tiene una fecha distinta a la del lote`);
  }

  if (measurement.env !== environment) {
    throw new Error(`El KPI ${measurement.kpi_id} tiene un ambiente distinto al del lote`);
  }

  if (measurement.run_id !== runId) {
    throw new Error(`El KPI ${measurement.kpi_id} tiene un run_id distinto al del lote`);
  }
}

function validateCompleteKpiIds(measurementsById: ReadonlyMap<KpiId, KpiMeasurement>): void {
  if (measurementsById.size !== KPI_IDS.length) {
    throw new Error("El lote completo debe contener exactamente los diez KPIs del catálogo");
  }

  for (const kpiId of KPI_IDS) {
    if (!measurementsById.has(kpiId)) {
      throw new Error("El lote completo debe contener exactamente los diez KPIs del catálogo");
    }
  }
}

function validatePartialSourceGroups(measurementsById: ReadonlyMap<KpiId, KpiMeasurement>): void {
  for (const [source, sourceKpiIds] of KPI_IDS_BY_SOURCE) {
    const includedKpiIds = sourceKpiIds.filter((kpiId) => measurementsById.has(kpiId));

    if (includedKpiIds.length > 0 && includedKpiIds.length !== sourceKpiIds.length) {
      throw new Error(`El lote parcial debe incluir todos los KPIs de la fuente ${source}`);
    }
  }
}

function validateRelatedValues(measurementsById: ReadonlyMap<KpiId, KpiMeasurement>): void {
  validateLessOrEqual(measurementsById, "http_5xx_responses", "http_requests");
  validateLessOrEqual(measurementsById, "ci_successful_runs_last_7_days", "ci_runs_last_7_days");
  validateLessOrEqual(measurementsById, "health_checks_successful", "health_checks_total");
}

function validateLessOrEqual(
  measurementsById: ReadonlyMap<KpiId, KpiMeasurement>,
  lowerKpiId: KpiId,
  upperKpiId: KpiId,
): void {
  const lowerMeasurement = measurementsById.get(lowerKpiId);
  const upperMeasurement = measurementsById.get(upperKpiId);

  if (lowerMeasurement && upperMeasurement && lowerMeasurement.value > upperMeasurement.value) {
    throw new Error(`${lowerKpiId} no puede superar a ${upperKpiId}`);
  }
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isValidDay(day: string): boolean {
  try {
    getArgentinaDayRange(day);
    return true;
  } catch {
    return false;
  }
}

function isKpiEnvironment(value: string): value is KpiEnvironment {
  return value === "dev" || value === "qa" || value === "prod";
}
