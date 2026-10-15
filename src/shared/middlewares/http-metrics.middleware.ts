import type { RequestHandler } from "express";
import type { HttpMetricsAccumulator } from "../../services/http-metrics-accumulator.js";
import { getArgentinaDay } from "../time/argentina-date.js";

const excludedGetPaths = new Set(["/health", "/internal/kpis"]);

export function createHttpMetricsMiddleware(accumulator: HttpMetricsAccumulator): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET" && excludedGetPaths.has(req.path)) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();

    res.once("finish", () => {
      if (res.locals.isRouteNotFound) {
        return;
      }

      const responseDurationMs = (process.hrtime.bigint() - startedAt) / 1_000_000n;

      accumulator.record(getArgentinaDay(new Date()), {
        requestCount: 1,
        serverErrorCount: res.statusCode >= 500 && res.statusCode < 600 ? 1 : 0,
        responseDurationMs,
      });
    });

    next();
  };
}
