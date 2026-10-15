import express, { type Express } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createHttpMetricsMiddleware } from "../src/shared/middlewares/http-metrics.middleware.js";
import type { HttpMetricsAccumulator } from "../src/services/http-metrics-accumulator.js";

describe("HTTP metrics middleware", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registra respuestas 2xx", async () => {
    const accumulator = createAccumulator();
    const app = createApp(accumulator, (router) => {
      router.get("/events", (_req, res) => res.status(200).end());
    });

    await request(app).get("/events").expect(200);

    expect(accumulator.record).toHaveBeenCalledWith(expect.any(String), {
      requestCount: 1,
      serverErrorCount: 0,
      responseDurationMs: expect.anything(),
    });
  });

  it("registra respuestas 500 a 599 como errores", async () => {
    const accumulator = createAccumulator();
    const app = createApp(accumulator, (router) => {
      router.get("/error", (_req, res) => res.status(500).end());
      router.get("/non-standard", (_req, res) => res.status(600).end());
    });

    await request(app).get("/error").expect(500);
    await request(app).get("/non-standard").expect(600);

    expect(accumulator.record).toHaveBeenNthCalledWith(1, expect.any(String), {
      requestCount: 1,
      serverErrorCount: 1,
      responseDurationMs: expect.anything(),
    });
    expect(accumulator.record).toHaveBeenNthCalledWith(2, expect.any(String), {
      requestCount: 1,
      serverErrorCount: 0,
      responseDurationMs: expect.anything(),
    });
  });

  it("excluye health, KPIs internos y rutas inexistentes", async () => {
    const accumulator = createAccumulator();
    const app = createApp(accumulator, (router) => {
      router.get("/health", (_req, res) => res.status(200).end());
      router.get("/internal/kpis", (_req, res) => res.status(200).end());
    });

    await request(app).get("/health").expect(200);
    await request(app).get("/internal/kpis").expect(200);
    await request(app).get("/missing").expect(404);

    expect(accumulator.record).not.toHaveBeenCalled();
  });

  it("cuenta un 404 de una ruta de producto", async () => {
    const accumulator = createAccumulator();
    const app = createApp(accumulator, (router) => {
      router.get("/events/:eventId", (_req, res) => res.status(404).end());
    });

    await request(app).get("/events/not-found").expect(404);

    expect(accumulator.record).toHaveBeenCalledOnce();
  });

  it("asigna la métrica al día argentino en que finaliza la respuesta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T02:59:59.000Z"));
    const accumulator = createAccumulator();
    const app = createApp(accumulator, (router) => {
      router.get("/cross-midnight", (_req, res) => {
        vi.setSystemTime(new Date("2026-10-13T03:00:01.000Z"));
        res.status(200).end();
      });
    });

    await request(app).get("/cross-midnight").expect(200);

    expect(accumulator.record).toHaveBeenCalledWith("2026-10-13", expect.any(Object));
  });
});

function createAccumulator(): HttpMetricsAccumulator {
  return {
    record: vi.fn(),
    flush: vi.fn(),
  };
}

function createApp(
  accumulator: HttpMetricsAccumulator,
  registerRoutes: (app: Express) => void,
): Express {
  const app = express();
  app.use(createHttpMetricsMiddleware(accumulator));
  registerRoutes(app);
  app.use((_req, res) => {
    res.locals.isRouteNotFound = true;
    res.status(404).end();
  });

  return app;
}
