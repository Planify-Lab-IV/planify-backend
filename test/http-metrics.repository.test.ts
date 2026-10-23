import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/infrastructure/prisma.js";
import { httpMetricsRepository } from "../src/repositories/http-metrics.repository.js";

const httpDailyMetric = prisma.httpDailyMetric as unknown as {
  upsert: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    httpDailyMetric: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe("HttpMetricsRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea o incrementa los contadores del día argentino", async () => {
    const delta = {
      requestCount: 12,
      serverErrorCount: 2,
      responseDurationMs: 1540n,
    };

    await httpMetricsRepository.addDailyMetrics("2026-10-12", delta);

    expect(httpDailyMetric.upsert).toHaveBeenCalledWith({
      where: { date: new Date("2026-10-12T00:00:00.000Z") },
      create: {
        date: new Date("2026-10-12T00:00:00.000Z"),
        ...delta,
      },
      update: {
        requestCount: { increment: 12 },
        serverErrorCount: { increment: 2 },
        responseDurationMs: { increment: 1540n },
      },
    });
  });

  it("busca los contadores persistidos para un día", async () => {
    const metric = {
      requestCount: 12,
      serverErrorCount: 2,
      responseDurationMs: 1540n,
    };
    httpDailyMetric.findUnique.mockResolvedValueOnce(metric);

    await expect(httpMetricsRepository.findDailyMetrics("2026-10-12")).resolves.toEqual(metric);

    expect(httpDailyMetric.findUnique).toHaveBeenCalledWith({
      where: { date: new Date("2026-10-12T00:00:00.000Z") },
      select: {
        requestCount: true,
        serverErrorCount: true,
        responseDurationMs: true,
      },
    });
  });
});
