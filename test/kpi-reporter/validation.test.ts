import { describe, expect, it } from "vitest";
import type { KpiMeasurement } from "../../kpi-reporter/measurements.js";
import { validateMeasurementBatch } from "../../kpi-reporter/validation.js";

const day = "2026-10-14";
const environment = "dev" as const;
const runId = "8e45ab89-d1f7-4e15-98a4-ff58d433696f";

const completeMeasurements: readonly KpiMeasurement[] = [
  createMeasurement("events_created_month_to_date", 8),
  createMeasurement("events_with_multiple_participants_count", 3),
  createMeasurement("events_with_activity_count", 5),
  createMeasurement("http_requests", 20),
  createMeasurement("http_5xx_responses", 2),
  createMeasurement("http_response_time_total_ms", 1500),
  createMeasurement("ci_runs_last_7_days", 10),
  createMeasurement("ci_successful_runs_last_7_days", 8),
  createMeasurement("health_checks_total", 10),
  createMeasurement("health_checks_successful", 9),
];

describe("validación del lote de KPIs", () => {
  it("acepta el lote completo con los diez KPIs coherentes", () => {
    expect(() => validateMeasurementBatch(completeMeasurements, validationOptions())).not.toThrow();
  });

  it("rechaza KPIs faltantes, desconocidos o repetidos", () => {
    expect(() =>
      validateMeasurementBatch(completeMeasurements.slice(1), validationOptions()),
    ).toThrow("exactamente los diez KPIs");

    expect(() =>
      validateMeasurementBatch(
        [...completeMeasurements, createMeasurement("unknown_kpi" as never, 1)],
        validationOptions(),
      ),
    ).toThrow("ID desconocido");

    expect(() =>
      validateMeasurementBatch(
        [...completeMeasurements, createMeasurement("http_requests", 1)],
        validationOptions(),
      ),
    ).toThrow("repite http_requests");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])(
    "rechaza valores inválidos: %p",
    (value) => {
      const measurements = completeMeasurements.map((measurement) =>
        measurement.kpi_id === "http_requests" ? { ...measurement, value } : measurement,
      );

      expect(() => validateMeasurementBatch(measurements, validationOptions())).toThrow(
        "http_requests tiene un valor inválido",
      );
    },
  );

  it("rechaza metadatos que no son compartidos por todo el lote", () => {
    const measurements = completeMeasurements.map((measurement) =>
      measurement.kpi_id === "http_requests"
        ? { ...measurement, run_id: "other-run" }
        : measurement,
    );

    expect(() => validateMeasurementBatch(measurements, validationOptions())).toThrow(
      "run_id distinto",
    );
  });

  it("rechaza pares de valores incoherentes", () => {
    const measurements = completeMeasurements.map((measurement) =>
      measurement.kpi_id === "health_checks_successful"
        ? { ...measurement, value: 11 }
        : measurement,
    );

    expect(() => validateMeasurementBatch(measurements, validationOptions())).toThrow(
      "health_checks_successful no puede superar a health_checks_total",
    );
  });

  it("acepta grupos completos de fuentes disponibles en un lote parcial", () => {
    const measurements = completeMeasurements.filter(
      (measurement) =>
        measurement.kpi_id === "ci_runs_last_7_days" ||
        measurement.kpi_id === "ci_successful_runs_last_7_days" ||
        measurement.kpi_id === "health_checks_total" ||
        measurement.kpi_id === "health_checks_successful",
    );

    expect(() =>
      validateMeasurementBatch(measurements, { ...validationOptions(), mode: "partial" }),
    ).not.toThrow();
  });

  it("rechaza un grupo de fuente incompleto en un lote parcial", () => {
    const measurements = completeMeasurements.filter(
      (measurement) => measurement.kpi_id === "ci_runs_last_7_days",
    );

    expect(() =>
      validateMeasurementBatch(measurements, { ...validationOptions(), mode: "partial" }),
    ).toThrow("todos los KPIs de la fuente github-actions");
  });
});

function createMeasurement(kpiId: KpiMeasurement["kpi_id"], value: number): KpiMeasurement {
  return {
    kpi_id: kpiId,
    value,
    date: day,
    env: environment,
    run_id: runId,
  };
}

function validationOptions() {
  return { day, environment, runId };
}
