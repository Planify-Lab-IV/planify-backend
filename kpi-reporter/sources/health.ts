const HEALTH_CHECK_ATTEMPTS = 10;
const HEALTH_CHECK_INTERVAL_MS = 30_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

export interface HealthKpis {
  health_checks_total: number;
  health_checks_successful: number;
}

export interface MeasureHealthKpisOptions {
  apiUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function measureHealthKpis({
  apiUrl,
  fetchImpl = fetch,
  sleep = defaultSleep,
}: MeasureHealthKpisOptions): Promise<HealthKpis> {
  if (!apiUrl) {
    throw new Error("PLANIFY_API_URL es requerida para medir la salud del backend");
  }

  const healthUrl = new URL("/health", apiUrl);
  let successfulChecks = 0;

  for (let attempt = 0; attempt < HEALTH_CHECK_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(healthUrl, {
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });

      if (response.status === 200) {
        successfulChecks += 1;
      }
    } catch {
      // Un timeout o un error de red mide un backend no disponible.
    }

    if (attempt < HEALTH_CHECK_ATTEMPTS - 1) {
      await sleep(HEALTH_CHECK_INTERVAL_MS);
    }
  }

  return {
    health_checks_total: HEALTH_CHECK_ATTEMPTS,
    health_checks_successful: successfulChecks,
  };
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
