import type { HttpMetricsRepository } from "../repositories/http-metrics.repository.js";
import type { KpiRepository } from "../repositories/kpi.repository.js";

export interface InternalKpis {
  events_created_month_to_date: number;
  events_with_multiple_participants_count: number;
  events_with_activity_count: number;
  http_requests: number;
  http_5xx_responses: number;
  http_response_time_total_ms: number;
}

export interface KpiService {
  getInternalKpis(day: string): Promise<InternalKpis>;
}

export function createKpiService(
  kpiRepository: KpiRepository,
  httpMetricsRepository: HttpMetricsRepository,
): KpiService {
  return {
    async getInternalKpis(day: string): Promise<InternalKpis> {
      const [
        eventsCreatedMonthToDate,
        eventsWithMultipleParticipants,
        eventsWithActivity,
        httpMetrics,
      ] = await Promise.all([
        kpiRepository.countEventsCreatedMonthToDate(day),
        kpiRepository.countEventsWithMultipleParticipants(day),
        kpiRepository.countEventsWithActivity(day),
        httpMetricsRepository.findDailyMetrics(day),
      ]);

      return {
        events_created_month_to_date: eventsCreatedMonthToDate,
        events_with_multiple_participants_count: eventsWithMultipleParticipants,
        events_with_activity_count: eventsWithActivity,
        http_requests: httpMetrics?.requestCount ?? 0,
        http_5xx_responses: httpMetrics?.serverErrorCount ?? 0,
        http_response_time_total_ms: Number(httpMetrics?.responseDurationMs ?? 0n),
      };
    },
  };
}
