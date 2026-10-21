import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { prisma } from "../../src/infrastructure/prisma.js";
import app from "../../src/app.js";

vi.mock("../../src/infrastructure/prisma.js", () => ({
  prisma: (() => {
    const transactionClient = {
      $queryRaw: vi.fn(),
      user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      passwordResetCode: {
        create: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    return {
      ...transactionClient,
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    };
  })(),
}));

const existingUser = {
  id: "user-1",
  name: "Ana",
  username: "ana",
  email: "ana@planify.dev",
  avatarUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: existingUser.id }] as never);
  vi.mocked(prisma.passwordResetCode.count).mockResolvedValue(0);
  vi.mocked(prisma.passwordResetCode.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe("password reset endpoints", () => {
  it("devuelve la misma respuesta cuando existe, no existe o alcanzó el límite", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(existingUser as never)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingUser as never);
    vi.mocked(prisma.passwordResetCode.count).mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const existing = await request(app)
      .post("/auth/forgot-password")
      .send({ email: existingUser.email });
    const missing = await request(app)
      .post("/auth/forgot-password")
      .send({ email: "missing@planify.dev" });
    const limited = await request(app)
      .post("/auth/forgot-password")
      .send({ email: existingUser.email });

    expect(existing).toEqual(expect.objectContaining({ status: 200, body: missing.body }));
    expect(limited).toEqual(expect.objectContaining({ status: 200, body: missing.body }));
    expect(prisma.passwordResetCode.create).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("restablece la contraseña con un código correcto", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser as never);
    vi.mocked(prisma.passwordResetCode.findFirst).mockResolvedValueOnce({
      id: "reset-1",
      codeHash: await bcrypt.hash("123456", 10),
    } as never);

    const response = await request(app).post("/auth/reset-password").send({
      email: existingUser.email,
      code: "123456",
      newPassword: "NuevaClave123!",
    });

    expect(response.status).toBe(204);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: existingUser.id },
      data: { passwordHash: expect.any(String), passwordChangedAt: expect.any(Date) },
    });
  });

  it.each([
    ["email inexistente", null, undefined],
    ["sin código activo", existingUser, []],
    [
      "código incorrecto",
      existingUser,
      [{ id: "reset-1", codeHash: bcrypt.hashSync("654321", 10) }],
    ],
  ])("responde INVALID_RESET_CODE para %s", async (_description, foundUser, reservedCodes) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(foundUser as never);
    if (reservedCodes !== undefined) {
      vi.mocked(prisma.passwordResetCode.findFirst).mockResolvedValueOnce(
        ((reservedCodes as Array<{ id: string; codeHash: string }>).at(0) ?? null) as never,
      );
    }

    const response = await request(app).post("/auth/reset-password").send({
      email: existingUser.email,
      code: "123456",
      newPassword: "NuevaClave123!",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_RESET_CODE");
  });

  it("rechaza formatos inválidos sin reservar un intento", async () => {
    const response = await request(app).post("/auth/reset-password").send({
      email: existingUser.email,
      code: "not-a-code",
      newPassword: "corta",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(prisma.passwordResetCode.findFirst).not.toHaveBeenCalled();
  });
});
