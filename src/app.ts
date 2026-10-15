//

import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./shared/config/env.js";
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
app.use(createRouter(httpMetricsAccumulator));

app.use(errorHandler);

export default app;
