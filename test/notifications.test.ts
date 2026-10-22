import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    pushDevice: { upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  },
}));

describe("rutas de dispositivos push", () => {
  const tokenService = createSessionTokenService(env.JWT_SECRET);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
    vi.mocked(prisma.pushDevice.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.pushDevice.deleteMany).mockResolvedValue({ count: 0 } as never);
  });

  it("registra un dispositivo para la sesión de usuario", async () => {
    const response = await request(app)
      .post("/notifications/register-device")
      .set("Authorization", `Bearer ${tokenService.sign("user-1")}`)
      .send({ pushToken: "push-token" });

    expect(response.status).toBe(204);
    expect(prisma.pushDevice.upsert).toHaveBeenCalledWith({
      where: { token: "push-token" },
      create: { userId: "user-1", token: "push-token" },
      update: { userId: "user-1" },
    });
  });

  it("desregistra de forma idempotente y sin borrar un token ajeno", async () => {
    const response = await request(app)
      .post("/notifications/unregister-device")
      .set("Authorization", `Bearer ${tokenService.sign("user-1")}`)
      .send({ pushToken: "push-token" });

    expect(response.status).toBe(204);
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { token: "push-token", userId: "user-1" },
    });
  });

  it.each([
    { body: {}, description: "sin token" },
    { body: { pushToken: "" }, description: "vacío" },
    { body: { pushToken: "ok", unexpected: true }, description: "con campos extra" },
  ])("rechaza un body $description", async ({ body }) => {
    const response = await request(app)
      .post("/notifications/register-device")
      .set("Authorization", `Bearer ${tokenService.sign("user-1")}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
  });

  it("requiere una sesión de usuario registrado", async () => {
    const anonymousSession = tokenService.signParticipant("participant-1", "event-1");

    await expect(
      request(app).post("/notifications/register-device").send({ pushToken: "push-token" }),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      request(app)
        .post("/notifications/register-device")
        .set("Authorization", `Bearer ${anonymousSession}`)
        .send({ pushToken: "push-token" }),
    ).resolves.toMatchObject({ status: 401 });
  });
});
