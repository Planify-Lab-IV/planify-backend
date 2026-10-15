export type KpiKind = "business" | "technical" | "health";
export type KpiUnit = "count" | "ms";
export type KpiSource = "backend" | "github-actions" | "health-probe";

export interface KpiDefinition {
  id: string;
  kind: KpiKind;
  unit: KpiUnit;
  source: KpiSource;
  description: string;
}

export const KPI_CATALOG = [
  {
    id: "events_created_month_to_date",
    kind: "business",
    unit: "count",
    source: "backend",
    description:
      "Eventos creados desde las 00:00 ART del primer día del mes hasta las 00:00 ART del día siguiente al medido, incluidos los cancelados.",
  },
  {
    id: "events_with_multiple_participants_count",
    kind: "business",
    unit: "count",
    source: "backend",
    description:
      "Eventos creados en la ventana mensual con al menos dos EventParticipant; es una foto de relaciones persistidas al consultar.",
  },
  {
    id: "events_with_activity_count",
    kind: "business",
    unit: "count",
    source: "backend",
    description:
      "Eventos creados en la ventana mensual con asistencia respondida, disponibilidad, tarea o gasto; es una foto de relaciones persistidas al consultar.",
  },
  {
    id: "http_requests",
    kind: "technical",
    unit: "count",
    source: "backend",
    description:
      "Requests de rutas de producto finalizadas desde las 00:00 ART hasta la corrida diaria, aproximadamente a las 21:15 ART.",
  },
  {
    id: "http_5xx_responses",
    kind: "technical",
    unit: "count",
    source: "backend",
    description:
      "Respuestas HTTP entre 500 y 599 de las requests de producto medidas durante el día argentino.",
  },
  {
    id: "http_response_time_total_ms",
    kind: "technical",
    unit: "ms",
    source: "backend",
    description:
      "Suma de duraciones en milisegundos de las requests de producto medidas durante el día argentino; no es un promedio.",
  },
  {
    id: "ci_runs_last_7_days",
    kind: "technical",
    unit: "count",
    source: "github-actions",
    description:
      "Corridas completadas de ci.yml de planify-backend y planify-mobile creadas en los siete días previos a la corrida del reporter.",
  },
  {
    id: "ci_successful_runs_last_7_days",
    kind: "technical",
    unit: "count",
    source: "github-actions",
    description:
      "Corridas completadas con conclusión success de ci.yml de planify-backend y planify-mobile creadas en los siete días previos a la corrida del reporter.",
  },
  {
    id: "health_checks_total",
    kind: "health",
    unit: "count",
    source: "health-probe",
    description:
      "Diez intentos de sondeo a GET /health separados por 30 segundos durante la ventana de medición.",
  },
  {
    id: "health_checks_successful",
    kind: "health",
    unit: "count",
    source: "health-probe",
    description:
      "Sondeos de GET /health que respondieron HTTP 200 entre los diez intentos de la ventana de medición.",
  },
] as const satisfies readonly KpiDefinition[];

export type KpiId = (typeof KPI_CATALOG)[number]["id"];
export const KPI_IDS = KPI_CATALOG.map((kpi) => kpi.id) as readonly KpiId[];
