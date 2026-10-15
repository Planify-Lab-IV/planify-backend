import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HTTP_METRICS_FLUSH_INTERVAL_MS,
  shutdownHttpMetrics,
  startHttpMetricsPeriodicFlush,
} from "../src/services/http-metrics-lifecycle.js";
import {
  createHttpMetricsAccumulator,
  type HttpMetricsAccumulator,
} from "../src/services/http-metrics-accumulator.js";
import type { HttpMetricsRepository } from "../src/repositories/http-metrics.repository.js";

describe("ciclo de vida de métricas HTTP", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("vuelca las métricas cada 30 segundos y se puede detener", async () => {
    vi.useFakeTimers();
    const accumulator = createAccumulator();
    const stopPeriodicFlush = startHttpMetricsPeriodicFlush(accumulator);

    await vi.advanceTimersByTimeAsync(HTTP_METRICS_FLUSH_INTERVAL_MS);
    expect(accumulator.flush).toHaveBeenCalledOnce();

    stopPeriodicFlush();
    await vi.advanceTimersByTimeAsync(HTTP_METRICS_FLUSH_INTERVAL_MS);
    expect(accumulator.flush).toHaveBeenCalledOnce();
  });

  it("detiene el intervalo, espera las requests en curso y hace el último volcado", async () => {
    const calls: string[] = [];
    const accumulator = createAccumulator();
    vi.mocked(accumulator.flush).mockImplementation(async () => {
      calls.push("flush");
    });
    const stopPeriodicFlush = vi.fn(() => calls.push("stop"));
    const server = {
      close: (callback: (error?: Error) => void) => {
        calls.push("close");
        callback();
      },
    };

    await shutdownHttpMetrics({ accumulator, server, stopPeriodicFlush });

    expect(calls).toEqual(["stop", "close", "flush"]);
  });

  it("intenta el último volcado aunque cerrar el servidor falle", async () => {
    const accumulator = createAccumulator();
    const closeError = new Error("server close failed");
    const server = {
      close: (callback: (error?: Error) => void) => callback(closeError),
    };

    await expect(
      shutdownHttpMetrics({ accumulator, server, stopPeriodicFlush: vi.fn() }),
    ).rejects.toThrow(closeError);

    expect(accumulator.flush).toHaveBeenCalledOnce();
  });

  it("espera el flush activo y persiste las requests que terminan durante el cierre", async () => {
    const repository = createRepository();
    let releaseActiveFlush: (() => void) | undefined;
    let notifyActiveFlushStarted: (() => void) | undefined;
    const activeFlushStarted = new Promise<void>((resolve) => {
      notifyActiveFlushStarted = resolve;
    });
    vi.mocked(repository.addDailyMetrics).mockImplementationOnce(async () => {
      notifyActiveFlushStarted?.();
      await new Promise<void>((resolve) => {
        releaseActiveFlush = resolve;
      });
    });
    const accumulator = createHttpMetricsAccumulator(repository);
    const day = "2026-10-12";

    accumulator.record(day, metrics(1, 0, 25n));
    const activeFlush = accumulator.flush();
    await activeFlushStarted;

    const shutdown = shutdownHttpMetrics({
      accumulator,
      stopPeriodicFlush: vi.fn(),
      server: {
        close: (callback) => {
          accumulator.record(day, metrics(2, 1, 75n));
          callback();
        },
      },
    });

    await Promise.resolve();
    releaseActiveFlush?.();
    await shutdown;
    await activeFlush;

    expect(repository.addDailyMetrics).toHaveBeenCalledTimes(2);
    expect(repository.addDailyMetrics).toHaveBeenNthCalledWith(1, day, metrics(1, 0, 25n));
    expect(repository.addDailyMetrics).toHaveBeenNthCalledWith(2, day, metrics(2, 1, 75n));
  });
});

function createAccumulator(): HttpMetricsAccumulator {
  return {
    record: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createRepository(): HttpMetricsRepository {
  return {
    addDailyMetrics: vi.fn(),
    findDailyMetrics: vi.fn(),
  };
}

function metrics(requestCount: number, serverErrorCount: number, responseDurationMs: bigint) {
  return { requestCount, serverErrorCount, responseDurationMs };
}
