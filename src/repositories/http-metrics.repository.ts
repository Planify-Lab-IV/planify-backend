import { prisma } from "../infrastructure/prisma.js";

export interface HttpMetricsDelta {
  requestCount: number;
  serverErrorCount: number;
  responseDurationMs: bigint;
}

export interface HttpMetricsRepository {
  addDailyMetrics(day: string, delta: HttpMetricsDelta): Promise<void>;
}

export const httpMetricsRepository: HttpMetricsRepository = {
  async addDailyMetrics(day, delta): Promise<void> {
    const date = new Date(`${day}T00:00:00.000Z`);

    await prisma.httpDailyMetric.upsert({
      where: { date },
      create: {
        date,
        requestCount: delta.requestCount,
        serverErrorCount: delta.serverErrorCount,
        responseDurationMs: delta.responseDurationMs,
      },
      update: {
        requestCount: { increment: delta.requestCount },
        serverErrorCount: { increment: delta.serverErrorCount },
        responseDurationMs: { increment: delta.responseDurationMs },
      },
    });
  },
};
