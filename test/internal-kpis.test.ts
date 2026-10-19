import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const internalKpisToken = "token-interno-de-kpis-con-al-menos-32-caracteres";

vi.mock("../src/shared/config/env.js", () => ({
  getAvatarStorageMode: () => "unavailable",
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

const prismaMock = prisma as unknown as {
  event: { count: ReturnType<typeof vi.fn> };
  eventParticipant: { groupBy: ReturnType<typeof vi.fn> };
  httpDailyMetric: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

describe("GET /internal/kpis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve los tres KPIs de negocio y los tres HTTP", async () => {
    prismaMock.event.count.mockResolvedValueOnce(8).mockResolvedValueOnce(3);
    prismaMock.eventParticipant.groupBy.mockResolvedValueOnce([
      { eventId: "event-1", _count: { eventId: 2 } },
      { eventId: "event-2", _count: { eventId: 4 } },
    ]);
    prismaMock.httpDailyMetric.findUnique.mockResolvedValueOnce({
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
    prismaMock.event.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prismaMock.eventParticipant.groupBy.mockResolvedValueOnce([]);
    prismaMock.httpDailyMetric.findUnique.mockResolvedValueOnce(null);

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
    prismaMock.httpDailyMetric.upsert.mockImplementation(
      async ({
        create,
        update,
      }: {
        create: typeof storedHttpMetrics;
        update: Record<string, unknown>;
      }) => {
        if (storedHttpMetrics.requestCount === 0) {
          storedHttpMetrics = {
            requestCount: create.requestCount,
            serverErrorCount: create.serverErrorCount,
            responseDurationMs: create.responseDurationMs,
          };
        } else {
          storedHttpMetrics = {
            requestCount:
              storedHttpMetrics.requestCount +
              (update.requestCount as { increment: number }).increment,
            serverErrorCount:
              storedHttpMetrics.serverErrorCount +
              (update.serverErrorCount as { increment: number }).increment,
            responseDurationMs:
              storedHttpMetrics.responseDurationMs +
              (update.responseDurationMs as { increment: bigint }).increment,
          };
        }

        return storedHttpMetrics;
      },
    );
    prismaMock.httpDailyMetric.findUnique.mockImplementation(async () => storedHttpMetrics);
    prismaMock.event.count.mockResolvedValue(0);
    prismaMock.eventParticipant.groupBy.mockResolvedValue([]);
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
    expect(prismaMock.httpDailyMetric.upsert).toHaveBeenCalledOnce();
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
