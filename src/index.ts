// --> Entrypoint de la app,

import "dotenv/config";
import app, { httpMetricsAccumulator } from "./app.js";
import { env } from "./shared/config/env.js";
import {
  shutdownHttpMetrics,
  startHttpMetricsPeriodicFlush,
} from "./services/http-metrics-lifecycle.js";

const server = app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} ${env.NODE_ENV}]`);
}); // --> Abre el puerto y empieza a escuchar datos

const stopPeriodicFlush =
  env.NODE_ENV === "test" ? () => undefined : startHttpMetricsPeriodicFlush(httpMetricsAccumulator);

process.once("SIGTERM", () => {
  void shutdownHttpMetrics({
    accumulator: httpMetricsAccumulator,
    server,
    stopPeriodicFlush,
  }).then(
    () => process.exit(0),
    (error: unknown) => {
      console.error("No se pudo completar el apagado de las métricas HTTP", error);
      process.exit(1);
    },
  );
});
