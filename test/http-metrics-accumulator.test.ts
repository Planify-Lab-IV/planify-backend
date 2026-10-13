import { describe, expect, it, vi } from "vitest";
import { createHttpMetricsAccumulator } from "../src/services/http-metrics-accumulator.js";
import type {
  HttpMetricsDelta,
  HttpMetricsRepository,
} from "../src/repositories/http-metrics.repository.js";

describe("HttpMetricsAccumulator", () => {
  it("acumula incrementos del mismo día antes de persistirlos", async () => {
    const repository = createRepository();
    const accumulator = createHttpMetricsAccumulator(repository);

    accumulator.record("2026-10-12", metrics(1, 0, 25n));
    accumulator.record("2026-10-12", metrics(2, 1, 75n));

    await accumulator.flush();

    expect(repository.addDailyMetrics).toHaveBeenCalledWith("2026-10-12", metrics(3, 1, 100n));
  });

  it("mantiene separados los incrementos de días distintos", async () => {
    const repository = createRepository();
    const accumulator = createHttpMetricsAccumulator(repository);

    accumulator.record("2026-10-12", metrics(1, 0, 25n));
    accumulator.record("2026-10-13", metrics(2, 1, 75n));

    await accumulator.flush();

    expect(repository.addDailyMetrics).toHaveBeenCalledTimes(2);
    expect(repository.addDailyMetrics).toHaveBeenNthCalledWith(1, "2026-10-12", metrics(1, 0, 25n));
    expect(repository.addDailyMetrics).toHaveBeenNthCalledWith(2, "2026-10-13", metrics(2, 1, 75n));
  });

  it("reintenta los valores que no se pudieron guardar", async () => {
    const repository = createRepository();
    vi.mocked(repository.addDailyMetrics)
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(undefined);
    const accumulator = createHttpMetricsAccumulator(repository);

    accumulator.record("2026-10-12", metrics(2, 1, 75n));

    await expect(accumulator.flush()).rejects.toThrow("database unavailable");
    await accumulator.flush();

    expect(repository.addDailyMetrics).toHaveBeenCalledTimes(2);
    expect(repository.addDailyMetrics).toHaveBeenNthCalledWith(2, "2026-10-12", metrics(2, 1, 75n));
  });

  it("no vuelve a guardar los días que ya persistió antes de un fallo", async () => {
    const repository = createRepository();
    vi.mocked(repository.addDailyMetrics)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(undefined);
    const accumulator = createHttpMetricsAccumulator(repository);

    accumulator.record("2026-10-12", metrics(1, 0, 10n));
    accumulator.record("2026-10-13", metrics(2, 1, 20n));

    await expect(accumulator.flush()).rejects.toThrow("database unavailable");
    await accumulator.flush();

    expect(repository.addDailyMetrics).toHaveBeenCalledTimes(3);
    expect(repository.addDailyMetrics).toHaveBeenNthCalledWith(3, "2026-10-13", metrics(2, 1, 20n));
  });

  it("rechaza incrementos inválidos antes de acumularlos", () => {
    const accumulator = createHttpMetricsAccumulator(createRepository());

    expect(() => accumulator.record("2026-10-12", metrics(-1, 0, 0n))).toThrow(RangeError);
  });
});

function createRepository(): HttpMetricsRepository {
  return {
    addDailyMetrics: vi.fn(),
  };
}

function metrics(
  requestCount: number,
  serverErrorCount: number,
  responseDurationMs: bigint,
): HttpMetricsDelta {
  return { requestCount, serverErrorCount, responseDurationMs };
}
