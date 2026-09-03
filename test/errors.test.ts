import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
import app from "../src/app.js";
import { errorHandler } from "../src/shared/middlewares/error.middleware.js";

describe("Error handling", () => {
  it("debería retornar 404 JSON para ruta inexistente", async () => {
    const res = await request(app).get("/no-existe");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.error).toBe("ROUTE_NOT_FOUND");
  });

  it("debería retornar 400 para JSON inválido", async () => {
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{ invalid json }");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.error).toBe("INVALID_JSON");
  });

  it("debería retornar 503 cuando la DB falla", async () => {
    const { healthRepository } = await import("../src/repositories/health.repository.js");
    vi.spyOn(healthRepository, "check").mockRejectedValueOnce(new Error("Connection refused"));

    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.error).toBe("INTERNAL_SERVER_ERROR");
    expect(res.body.message).toBe("Database connection failed");
  });

  it("returns an UPPER_SNAKE_CASE code for an unhandled 500 error", async () => {
    const testApp = express();
    testApp.get("/unexpected-error", (_req, _res, next) => next(new Error("Unexpected")));
    testApp.use(errorHandler);

    const res = await request(testApp).get("/unexpected-error");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: "INTERNAL_SERVER_ERROR",
      message: "Error interno del servidor",
    });
  });
});
