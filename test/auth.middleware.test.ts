// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../src/types/express.d.ts" />
import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { createAuthMiddleware } from "../src/shared/middlewares/auth.middleware.js";
import { errorHandler } from "../src/shared/middlewares/error.middleware.js";

const TEST_SECRET = "test-secret-que-cumple-con-los-32-caracteres";

function makeApp() {
  const auth = createAuthMiddleware(createSessionTokenService(TEST_SECRET));
  const app = express();
  app.use(express.json());

  app.get("/protegida", auth, (req: Request, res: Response) => {
    res.status(200).json({ usuarioId: req.usuarioId });
  });

  app.use(errorHandler);
  return app;
}

describe("requireAuthenticatedUser", () => {
  it("devuelve 401 sin token", async () => {
    const res = await request(makeApp()).get("/protegida");
    expect(res.status).toBe(401);
  });

  it("devuelve 401 con header sin esquema Bearer", async () => {
    const res = await request(makeApp()).get("/protegida").set("Authorization", "Basic abc");
    expect(res.status).toBe(401);
  });

  it("devuelve 401 con token inválido", async () => {
    const res = await request(makeApp()).get("/protegida").set("Authorization", "Bearer invalido");
    expect(res.status).toBe(401);
  });

  it("devuelve 401 si el token está firmado pero no tiene claim sub", async () => {
    const tokenSinSub = jwt.sign({ rol: "invitado" }, TEST_SECRET);
    const res = await request(makeApp())
      .get("/protegida")
      .set("Authorization", `Bearer ${tokenSinSub}`);

    expect(res.status).toBe(401);
  });

  it("deja pasar con un token válido", async () => {
    const token = createSessionTokenService(TEST_SECRET).sign("user-42");
    const res = await request(makeApp()).get("/protegida").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.usuarioId).toBe("user-42");
  });
});
