import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import bcrypt from "bcrypt";

// --> Mock de la infraestructura de base de datos
vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    usuario: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

describe("POST /auth/login", () => {
  const mockPasswordPlana = "DevPass123!";
  const mockPasswordHash = bcrypt.hashSync(mockPasswordPlana, 10);

  const mockUserEnDB = {
    id: "uuid-organizador-1",
    nombre: "dev1",
    email: "dev1@planify.dev",
    passwordHash: mockPasswordHash,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debería autenticar exitosamente usando email y retornar usuario + token", async () => {
    vi.mocked(prisma.usuario.findFirst).mockResolvedValueOnce(mockUserEnDB as never);

    const res = await request(app).post("/auth/login").send({
      identifier: "dev1@planify.dev",
      password: mockPasswordPlana,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user).toEqual({
      id: "uuid-organizador-1",
      nombre: "dev1",
      email: "dev1@planify.dev",
    });
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("debería autenticar exitosamente usando nombre de usuario (username)", async () => {
    vi.mocked(prisma.usuario.findFirst).mockResolvedValueOnce(mockUserEnDB as never);

    const res = await request(app).post("/auth/login").send({
      identifier: "dev1",
      password: mockPasswordPlana,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.nombre).toBe("dev1");
  });

  it("debería retornar 401 si el usuario no existe", async () => {
    vi.mocked(prisma.usuario.findFirst).mockResolvedValueOnce(null);

    const res = await request(app).post("/auth/login").send({
      identifier: "noexiste@planify.dev",
      password: mockPasswordPlana,
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHORIZED");
    expect(res.body.message).toBe("Credenciales inválidas");
  });

  it("debería retornar 401 si la contraseña es incorrecta", async () => {
    vi.mocked(prisma.usuario.findFirst).mockResolvedValueOnce(mockUserEnDB as never);

    const res = await request(app).post("/auth/login").send({
      identifier: "dev1@planify.dev",
      password: "PasswordIncorrecta!",
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHORIZED");
    expect(res.body.message).toBe("Credenciales inválidas");
  });

  it("debería retornar 400 si falta el identifier", async () => {
    const res = await request(app).post("/auth/login").send({
      password: mockPasswordPlana,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_DATA");
  });

  it("debería retornar 400 si falta el password", async () => {
    const res = await request(app).post("/auth/login").send({
      identifier: "dev1@planify.dev",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_DATA");
  });
});
