// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../src/types/express.d.ts" />
import { describe, expect, it } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createSessionTokenService } from "../../src/infrastructure/security/session.token.service.js";
import { createAttendanceAuthMiddleware } from "../../src/shared/middlewares/attendance.auth.middleware.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";

const TEST_SECRET = "test-secret-que-cumple-con-los-32-caracteres";

function makeApp() {
  const app = express();
  app.get(
    "/attendance-protected",
    createAttendanceAuthMiddleware(createSessionTokenService(TEST_SECRET)),
    (req, res) => res.status(200).json(req.attendanceActor),
  );
  app.use(errorHandler);
  return app;
}

describe("requireAuthenticatedAttendanceActor", () => {
  it("acepta un token de usuario", async () => {
    const token = createSessionTokenService(TEST_SECRET).sign("user-1");

    const response = await request(makeApp())
      .get("/attendance-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ type: "user", userId: "user-1" });
  });

  it("acepta un token de participante anónimo", async () => {
    const token = createSessionTokenService(TEST_SECRET).signParticipant(
      "participant-1",
      "event-1",
    );

    const response = await request(makeApp())
      .get("/attendance-protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      type: "anonymousParticipant",
      participantId: "participant-1",
      eventId: "event-1",
    });
  });

  it.each([
    undefined,
    "Basic token",
    "Bearer inválido",
    `Bearer ${jwt.sign({ sub: "actor", sessionType: "unknown" }, TEST_SECRET)}`,
  ])("rechaza una credencial no válida: %s", async (authorization) => {
    const requestBuilder = request(makeApp()).get("/attendance-protected");
    const response = authorization
      ? await requestBuilder.set("Authorization", authorization)
      : await requestBuilder;

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });
});
