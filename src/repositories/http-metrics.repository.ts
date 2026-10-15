import { prisma } from "../infrastructure/prisma.js";

export interface HttpMetricsDelta {
  requestCount: number;
  serverErrorCount: number;
  responseDurationMs: bigint;
}

export interface HttpMetricsRepository {
  addDailyMetrics(day: string, delta: HttpMetricsDelta): Promise<void>;
  findDailyMetrics(day: string): Promise<HttpMetricsDelta | null>;
}

export const httpMetricsRepository: HttpMetricsRepository = {
  async addDailyMetrics(day, delta): Promise<void> {
    const date = toDatabaseDate(day);

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

  async findDailyMetrics(day: string): Promise<HttpMetricsDelta | null> {
    const metric = await prisma.httpDailyMetric.findUnique({
      where: { date: toDatabaseDate(day) },
      select: {
        requestCount: true,
        serverErrorCount: true,
        responseDurationMs: true,
      },
    });

    return metric;
  },
};

function toDatabaseDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
