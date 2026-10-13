import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HTTP_METRICS_FLUSH_INTERVAL_MS,
  shutdownHttpMetrics,
  startHttpMetricsPeriodicFlush,
} from "../src/services/http-metrics-lifecycle.js";
import type { HttpMetricsAccumulator } from "../src/services/http-metrics-accumulator.js";

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
});

function createAccumulator(): HttpMetricsAccumulator {
  return {
    record: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}
