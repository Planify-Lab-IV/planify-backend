import type { HttpMetricsAccumulator } from "./http-metrics-accumulator.js";

export const HTTP_METRICS_FLUSH_INTERVAL_MS = 30_000;

interface ClosableServer {
  close(callback: (error?: Error) => void): void;
}

interface HttpMetricsShutdownOptions {
  accumulator: HttpMetricsAccumulator;
  server: ClosableServer;
  stopPeriodicFlush: () => void;
}

export function startHttpMetricsPeriodicFlush(accumulator: HttpMetricsAccumulator): () => void {
  const interval = setInterval(() => {
    void accumulator.flush().catch((error: unknown) => {
      console.error("No se pudieron persistir las métricas HTTP", error);
    });
  }, HTTP_METRICS_FLUSH_INTERVAL_MS);

  return () => clearInterval(interval);
}

export async function shutdownHttpMetrics({
  accumulator,
  server,
  stopPeriodicFlush,
}: HttpMetricsShutdownOptions): Promise<void> {
  stopPeriodicFlush();

  let closeError: unknown;
  try {
    await closeServer(server);
  } catch (error) {
    closeError = error;
  }

  await accumulator.flush();

  if (closeError) {
    throw closeError;
  }
}

function closeServer(server: ClosableServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
