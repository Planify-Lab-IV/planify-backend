import type {
  HttpMetricsDelta,
  HttpMetricsRepository,
} from "../repositories/http-metrics.repository.js";

export interface HttpMetricsAccumulator {
  record(day: string, delta: HttpMetricsDelta): void;
  flush(): Promise<void>;
}

export function createHttpMetricsAccumulator(
  repository: HttpMetricsRepository,
): HttpMetricsAccumulator {
  let pendingByDay = new Map<string, HttpMetricsDelta>();
  let activeFlush: Promise<void> | undefined;

  function addToPending(day: string, delta: HttpMetricsDelta): void {
    const pending = pendingByDay.get(day) ?? emptyDelta();
    pendingByDay.set(day, addDeltas(pending, delta));
  }

  async function flushPending(): Promise<void> {
    while (pendingByDay.size > 0) {
      const snapshot = pendingByDay;
      pendingByDay = new Map();
      const entries = [...snapshot.entries()];

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!entry) continue;

        const [day, delta] = entry;

        try {
          await repository.addDailyMetrics(day, delta);
        } catch (error) {
          for (const remainingEntry of entries.slice(index)) {
            if (remainingEntry) {
              addToPending(remainingEntry[0], remainingEntry[1]);
            }
          }

          throw error;
        }
      }
    }
  }

  return {
    record(day: string, delta: HttpMetricsDelta): void {
      validateDelta(delta);
      addToPending(day, delta);
    },

    flush(): Promise<void> {
      if (activeFlush) {
        return activeFlush;
      }

      activeFlush = flushPending().finally(() => {
        activeFlush = undefined;
      });

      return activeFlush;
    },
  };
}

// funciones puras sin estado

function emptyDelta(): HttpMetricsDelta {
  return {
    requestCount: 0,
    serverErrorCount: 0,
    responseDurationMs: 0n,
  };
}

function addDeltas(left: HttpMetricsDelta, right: HttpMetricsDelta): HttpMetricsDelta {
  return {
    requestCount: left.requestCount + right.requestCount,
    serverErrorCount: left.serverErrorCount + right.serverErrorCount,
    responseDurationMs: left.responseDurationMs + right.responseDurationMs,
  };
}

function validateDelta(delta: HttpMetricsDelta): void {
  if (
    !Number.isSafeInteger(delta.requestCount) ||
    delta.requestCount < 0 ||
    !Number.isSafeInteger(delta.serverErrorCount) ||
    delta.serverErrorCount < 0 ||
    delta.responseDurationMs < 0n
  ) {
    throw new RangeError("Las métricas HTTP deben ser incrementos enteros no negativos");
  }
}
