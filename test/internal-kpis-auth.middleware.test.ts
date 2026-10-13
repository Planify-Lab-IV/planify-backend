import express from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createInternalKpisAuthMiddleware } from "../src/shared/middlewares/internal-kpis-auth.middleware.js";
import { errorHandler } from "../src/shared/middlewares/error.middleware.js";

const validToken = "un-token-interno-de-kpis-con-al-menos-32-caracteres";

describe("middleware de autenticación de KPIs internos", () => {
  it("permite acceder con el token interno correcto", async () => {
    const response = await request(createApp(validToken))
      .get("/internal/kpis")
      .set("X-Internal-Token", validToken);

    expect(response.status).toBe(200);
  });

  it.each([
    ["sin token", undefined],
    ["con token incorrecto", "un-token-interno-distinto"],
  ])("responde 401 %s", async (_scenario, token) => {
    const requestBuilder = request(createApp(validToken)).get("/internal/kpis");
    if (token) {
      requestBuilder.set("X-Internal-Token", token);
    }

    const response = await requestBuilder;

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("responde 401 si el token no está configurado", async () => {
    const response = await request(createApp(undefined))
      .get("/internal/kpis")
      .set("X-Internal-Token", validToken);

    expect(response.status).toBe(401);
  });
});

function createApp(internalKpisToken: string | undefined) {
  const app = express();
  app.get("/internal/kpis", createInternalKpisAuthMiddleware(internalKpisToken), (_req, res) => {
    res.status(200).end();
  });
  app.use(errorHandler);

  return app;
}
