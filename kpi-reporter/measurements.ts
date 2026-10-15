import type { KpiId, KpiSource } from "./catalog.js";

export type KpiEnvironment = "dev" | "qa" | "prod";

export type KpiValues = Partial<Record<KpiId, number>>;

export interface KpiMeasurement {
  kpi_id: KpiId;
  value: number;
  date: string;
  env: KpiEnvironment;
  run_id: string;
}

export interface SuccessfulKpiSourceResult {
  source: KpiSource;
  status: "success";
  values: KpiValues;
}

export interface FailedKpiSourceResult {
  source: KpiSource;
  status: "failure";
  error: Error;
}

export type KpiSourceResult = SuccessfulKpiSourceResult | FailedKpiSourceResult;
