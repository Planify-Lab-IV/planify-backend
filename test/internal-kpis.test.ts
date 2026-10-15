import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const internalKpisToken = "token-interno-de-kpis-con-al-menos-32-caracteres";

vi.mock("../src/shared/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 3000,
    DATABASE_URL: "postgresql://user:password@localhost:5432/planify",
    CORS_ORIGIN: "http://localhost:5173",
    JWT_SECRET: "jwt-secret-de-prueba-con-al-menos-32-caracteres",
    INTERNAL_KPIS_TOKEN: "token-interno-de-kpis-con-al-menos-32-caracteres",
  },
}));

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    event: {
      count: vi.fn(),
    },
    eventParticipant: {
      groupBy: vi.fn(),
    },
    httpDailyMetric: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import app, { httpMetricsAccumulator } from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";

describe("GET /internal/kpis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve los tres KPIs de negocio y los tres HTTP", async () => {
    vi.mocked(prisma.event.count).mockResolvedValueOnce(8).mockResolvedValueOnce(3);
    vi.mocked(prisma.eventParticipant.groupBy).mockResolvedValueOnce([
      { eventId: "event-1", _count: { eventId: 2 } },
      { eventId: "event-2", _count: { eventId: 4 } },
    ]);
    vi.mocked(prisma.httpDailyMetric.findUnique).mockResolvedValueOnce({
      requestCount: 15,
      serverErrorCount: 2,
      responseDurationMs: 1200n,
    });

    const response = await request(app)
      .get("/internal/kpis?date=2026-10-12")
      .set("X-Internal-Token", internalKpisToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      events_created_month_to_date: 8,
      events_with_multiple_participants_count: 2,
      events_with_activity_count: 3,
      http_requests: 15,
      http_5xx_responses: 2,
      http_response_time_total_ms: 1200,
    });
  });

  it("devuelve cero para los KPIs HTTP si el día todavía no tiene métricas", async () => {
    vi.mocked(prisma.event.count).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    vi.mocked(prisma.eventParticipant.groupBy).mockResolvedValueOnce([]);
    vi.mocked(prisma.httpDailyMetric.findUnique).mockResolvedValueOnce(null);

    const response = await request(app)
      .get("/internal/kpis?date=2026-10-12")
      .set("X-Internal-Token", internalKpisToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      http_requests: 0,
      http_5xx_responses: 0,
      http_response_time_total_ms: 0,
    });
  });

  it("vuelca las métricas HTTP pendientes antes de responder", async () => {
    let storedHttpMetrics = {
      requestCount: 0,
      serverErrorCount: 0,
      responseDurationMs: 0n,
    };
    vi.mocked(prisma.httpDailyMetric.upsert).mockImplementation(async ({ create, update }) => {
      if (storedHttpMetrics.requestCount === 0) {
        storedHttpMetrics = {
          requestCount: create.requestCount,
          serverErrorCount: create.serverErrorCount,
          responseDurationMs: create.responseDurationMs,
        };
      } else {
        storedHttpMetrics = {
          requestCount: storedHttpMetrics.requestCount + update.requestCount.increment,
          serverErrorCount: storedHttpMetrics.serverErrorCount + update.serverErrorCount.increment,
          responseDurationMs:
            storedHttpMetrics.responseDurationMs + update.responseDurationMs.increment,
        };
      }

      return storedHttpMetrics;
    });
    vi.mocked(prisma.httpDailyMetric.findUnique).mockImplementation(async () => storedHttpMetrics);
    vi.mocked(prisma.event.count).mockResolvedValue(0);
    vi.mocked(prisma.eventParticipant.groupBy).mockResolvedValue([]);
    httpMetricsAccumulator.record("2026-10-12", {
      requestCount: 1,
      serverErrorCount: 1,
      responseDurationMs: 75n,
    });

    const response = await request(app)
      .get("/internal/kpis?date=2026-10-12")
      .set("X-Internal-Token", internalKpisToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      http_requests: 1,
      http_5xx_responses: 1,
      http_response_time_total_ms: 75,
    });
    expect(prisma.httpDailyMetric.upsert).toHaveBeenCalledOnce();
  });

  it("responde 400 ante una fecha inválida o futura", async () => {
    const invalidDateResponse = await request(app)
      .get("/internal/kpis?date=2026-02-30")
      .set("X-Internal-Token", internalKpisToken);
    const futureDateResponse = await request(app)
      .get("/internal/kpis?date=9999-01-01")
      .set("X-Internal-Token", internalKpisToken);

    expect(invalidDateResponse.status).toBe(400);
    expect(futureDateResponse.status).toBe(400);
  });

  it("responde 401 sin el token interno", async () => {
    const response = await request(app).get("/internal/kpis?date=2026-10-12");

    expect(response.status).toBe(401);
  });
});
