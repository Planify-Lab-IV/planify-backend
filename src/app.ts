//

import express from "express";
import helmet from "helmet";
import cors from "cors";
import { join } from "node:path";
import { env, getAvatarStorageMode } from "./shared/config/env.js";
import { createRouter } from "./routes/router.js";
import { errorHandler } from "./shared/middlewares/error.middleware.js";
import { createHttpMetricsMiddleware } from "./shared/middlewares/http-metrics.middleware.js";
import { httpMetricsRepository } from "./repositories/http-metrics.repository.js";
import { createHttpMetricsAccumulator } from "./services/http-metrics-accumulator.js";

const app = express();
export const httpMetricsAccumulator = createHttpMetricsAccumulator(httpMetricsRepository);

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.use(createHttpMetricsMiddleware(httpMetricsAccumulator));

if (getAvatarStorageMode(env) === "local") {
  app.use(
    "/uploads",
    express.static(join(process.cwd(), "uploads"), {
      setHeaders(response) {
        response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );
}

app.use(createRouter(httpMetricsAccumulator));

app.use(errorHandler);

export default app;
