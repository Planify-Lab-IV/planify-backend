import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import jwt from "jsonwebtoken";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    grupo: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    miembroGrupo: {
      findUnique: vi.fn(),
    },
    evento: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

describe("POST /events", () => {
  const mockOrganizerId = "user-organizador-1";
  const validToken = jwt.sign({ sub: mockOrganizerId }, env.JWT_SECRET);

  const mockOrganizer = {
    id: mockOrganizerId,
    nombre: "organizador",
    email: "organizador@test.com",
    passwordHash: "hash",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("debería retornar 401 si no se envía token de autenticación", async () => {
    const res = await request(app).post("/events").send({
      nombre: "Cumple",
      nuevoGrupoNombre: "Amigos",
    });

    expect(res.status).toBe(401);
  });

  it("debería retornar 400 si se envía grupoId y nuevoGrupoNombre a la vez", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(mockOrganizer as never);

    const res = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        nombre: "Cumple",
        grupoId: "grupo-1",
        nuevoGrupoNombre: "Nuevo Grupo",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_DATA");
  });

  it("debería crear un evento con grupo existente correctamente", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(mockOrganizer as never);

    const mockGrupo = {
      id: "grupo-existente-1",
      nombre: "Grupo de Prueba",
      miembros: [
        { usuarioId: mockOrganizerId, usuario: mockOrganizer },
        {
          usuarioId: "user-amigo-2",
          usuario: { id: "user-amigo-2", nombre: "amigo", email: "amigo@test.com" },
        },
      ],
    };

    vi.mocked(prisma.grupo.findUnique).mockResolvedValueOnce(mockGrupo as never);

    const mockEventoCreado = {
      id: "evento-1",
      nombre: "Cumple",
      textPlace: "Casa de Ana",
      grupoId: "grupo-existente-1",
      creatorId: mockOrganizerId,
      estado: "planificacion",
      createdAt: new Date(),
      updatedAt: new Date(),
      participantes: [
        {
          id: "p1",
          eventoId: "evento-1",
          usuarioId: mockOrganizerId,
          username: "organizador",
          esOrganizador: true,
          esAnonimo: false,
        },
        {
          id: "p2",
          eventoId: "evento-1",
          usuarioId: "user-amigo-2",
          username: "amigo",
          esOrganizador: false,
          esAnonimo: false,
        },
      ],
    };

    const createEvento = vi.fn().mockResolvedValue(mockEventoCreado);

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (cb: (tx: unknown) => unknown) => {
      return cb({
        evento: { create: createEvento },
      });
    }) as never);

    const res = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        nombre: "Cumple",
        textPlace: "Casa de Ana",
        grupoId: "grupo-existente-1",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("evento-1");
    expect(res.body.participantes).toHaveLength(2);
    expect(res.body.participantes[0].esOrganizador).toBe(true);
    expect(createEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          textPlace: "Casa de Ana",
        }),
      }),
    );
  });

  it("debería retornar 403 si el organizador no pertenece al grupo existente", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(mockOrganizer as never);

    const mockGrupoSinOrganizador = {
      id: "grupo-ajeno",
      nombre: "Grupo Ajeno",
      miembros: [
        {
          usuarioId: "otro-user",
          usuario: { id: "otro-user", nombre: "otro", email: "otro@test.com" },
        },
      ],
    };

    vi.mocked(prisma.grupo.findUnique).mockResolvedValueOnce(mockGrupoSinOrganizador as never);

    const res = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        nombre: "Cumple",
        grupoId: "grupo-ajeno",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");
  });

  it("debería crear un nuevo grupo y evento con memberIdentifiers", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(mockOrganizer as never);

    const mockMember = {
      id: "user-ana",
      nombre: "ana",
      email: "ana@example.com",
      passwordHash: "hash",
    };

    vi.mocked(prisma.usuario.findFirst).mockResolvedValueOnce(mockMember as never);

    const mockEventoConNuevoGrupo = {
      id: "evento-nuevo-grupo",
      nombre: "Fiesta",
      placeText: null,
      grupoId: "nuevo-grupo-1",
      creatorId: mockOrganizerId,
      estado: "planificacion",
      createdAt: new Date(),
      updatedAt: new Date(),
      participantes: [
        {
          id: "p1",
          eventoId: "evento-nuevo-grupo",
          usuarioId: "user-ana",
          username: "ana",
          esOrganizador: false,
          esAnonimo: false,
        },
        {
          id: "p2",
          eventoId: "evento-nuevo-grupo",
          usuarioId: mockOrganizerId,
          username: "organizador",
          esOrganizador: true,
          esAnonimo: false,
        },
      ],
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (cb: (tx: unknown) => unknown) => {
      return cb({
        grupo: { create: vi.fn().mockResolvedValue({ id: "nuevo-grupo-1" }) },
        evento: { create: vi.fn().mockResolvedValue(mockEventoConNuevoGrupo) },
      });
    }) as never);

    const res = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        nombre: "Fiesta",
        nuevoGrupoNombre: "Grupo Cumple",
        memberIdentifiers: ["ana@example.com"],
      });

    expect(res.status).toBe(201);
    expect(res.body.participantes).toHaveLength(2);
  });

  it("debería retornar 404 si algún memberIdentifier no existe", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(mockOrganizer as never);
    vi.mocked(prisma.usuario.findFirst).mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        nombre: "Fiesta",
        nuevoGrupoNombre: "Grupo Cumple",
        memberIdentifiers: ["noexiste@example.com"],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });

  it("debería realizar rollback y responder 500 si la transacción falla", async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(mockOrganizer as never);

    const mockGrupo = {
      id: "grupo-1",
      nombre: "Grupo 1",
      miembros: [{ usuarioId: mockOrganizerId, usuario: mockOrganizer }],
    };
    vi.mocked(prisma.grupo.findUnique).mockResolvedValueOnce(mockGrupo as never);

    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("Error de DB en transacción"));

    const res = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        nombre: "Evento Fallido",
        grupoId: "grupo-1",
      });

    expect(res.status).toBe(500);
  });
});
