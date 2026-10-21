import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    friendship: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";

const tokenService = createSessionTokenService(env.JWT_SECRET);
const ana = { id: "ana", name: "Ana", username: "ana", email: "ana@planify.dev", avatarUrl: null };
const beto = {
  id: "beto",
  name: "Beto",
  username: "beto",
  email: "beto@planify.dev",
  avatarUrl: null,
};
const at = new Date("2026-10-19T12:00:00Z");
const friendship = {
  id: "request-1",
  requesterId: ana.id,
  addresseeId: beto.id,
  status: "pending",
  createdAt: at,
  requester: { id: ana.id, name: ana.name, username: ana.username },
  addressee: { id: beto.id, name: beto.name, username: beto.username },
};

function authenticated(userId = ana.id) {
  return `Bearer ${tokenService.sign(userId)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
  vi.mocked(prisma.friendship.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.friendship.findMany).mockResolvedValue([] as never);
});

describe("rutas de amigos", () => {
  it("GET /friends/search devuelve usuarios públicos y relaciones pendientes", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: beto.id, name: beto.name, username: beto.username },
    ] as never);
    vi.mocked(prisma.friendship.findMany).mockResolvedValueOnce([friendship] as never);

    const response = await request(app)
      .get("/friends/search?q=be")
      .set("Authorization", authenticated());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      users: [
        {
          id: beto.id,
          name: beto.name,
          username: beto.username,
          relationship: "request_sent",
          requestId: friendship.id,
        },
      ],
    });
    expect(response.body.users[0]).not.toHaveProperty("email");
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { not: ana.id }, username: { contains: "be", mode: "insensitive" } },
      select: { id: true, name: true, username: true },
      take: 20,
      orderBy: { username: "asc" },
    });
  });

  it("valida la búsqueda y exige una sesión de usuario", async () => {
    await expect(
      request(app).get("/friends/search?q=a").set("Authorization", authenticated()),
    ).resolves.toMatchObject({ status: 400 });
    await expect(request(app).get("/friends/search?q=an")).resolves.toMatchObject({ status: 401 });
    const participantToken = tokenService.signParticipant("participant-1", "event-1");
    await expect(
      request(app).get("/friends/search?q=an").set("Authorization", `Bearer ${participantToken}`),
    ).resolves.toMatchObject({ status: 401 });
  });

  it("POST /friends/requests crea una solicitud y devuelve su identificador", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ passwordChangedAt: null } as never)
      .mockResolvedValueOnce(beto as never);
    vi.mocked(prisma.friendship.create).mockResolvedValueOnce(friendship as never);

    const response = await request(app)
      .post("/friends/requests")
      .set("Authorization", authenticated())
      .send({ userId: beto.id });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      request: {
        id: friendship.id,
        user: { id: beto.id, name: beto.name, username: beto.username },
        createdAt: at.toJSON(),
      },
    });
  });

  it("traduce duplicados, destinatarios faltantes y bodies inválidos al contrato esperado", async () => {
    let response = await request(app)
      .post("/friends/requests")
      .set("Authorization", authenticated())
      .send({ userId: ana.id });
    expect(response.status).toBe(400);

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ passwordChangedAt: null } as never)
      .mockResolvedValueOnce(null as never);
    response = await request(app)
      .post("/friends/requests")
      .set("Authorization", authenticated())
      .send({ userId: "missing" });
    expect(response.status).toBe(404);

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ passwordChangedAt: null } as never)
      .mockResolvedValueOnce(beto as never);
    vi.mocked(prisma.friendship.findUnique).mockResolvedValueOnce(friendship as never);
    response = await request(app)
      .post("/friends/requests")
      .set("Authorization", authenticated())
      .send({ userId: beto.id });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("FRIENDSHIP_ALREADY_EXISTS");
  });

  it("GET /friends/requests separa solicitudes recibidas y enviadas", async () => {
    const received = {
      ...friendship,
      id: "received",
      requesterId: beto.id,
      addresseeId: ana.id,
      requester: friendship.addressee,
      addressee: friendship.requester,
    };
    vi.mocked(prisma.friendship.findMany)
      .mockResolvedValueOnce([received] as never)
      .mockResolvedValueOnce([friendship] as never);

    const response = await request(app)
      .get("/friends/requests")
      .set("Authorization", authenticated());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      received: [{ id: "received", user: received.requester, createdAt: at.toJSON() }],
      sent: [{ id: friendship.id, user: friendship.addressee, createdAt: at.toJSON() }],
    });
  });

  it("POST /friends/requests/:id/accept usa una actualización atómica y oculta solicitudes ajenas", async () => {
    vi.mocked(prisma.friendship.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    let response = await request(app)
      .post(`/friends/requests/${friendship.id}/accept`)
      .set("Authorization", authenticated(beto.id));
    expect(response.status).toBe(204);
    expect(prisma.friendship.updateMany).toHaveBeenCalledWith({
      where: { id: friendship.id, addresseeId: beto.id, status: "pending" },
      data: { status: "accepted" },
    });

    vi.mocked(prisma.friendship.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    response = await request(app)
      .post(`/friends/requests/${friendship.id}/accept`)
      .set("Authorization", authenticated(ana.id));
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("FRIEND_REQUEST_NOT_FOUND");
  });

  it("DELETE /friends/requests/:id permite rechazar o cancelar mediante borrado atómico", async () => {
    vi.mocked(prisma.friendship.deleteMany).mockResolvedValueOnce({ count: 1 } as never);
    let response = await request(app)
      .delete(`/friends/requests/${friendship.id}`)
      .set("Authorization", authenticated(beto.id));
    expect(response.status).toBe(204);
    expect(prisma.friendship.deleteMany).toHaveBeenCalledWith({
      where: {
        id: friendship.id,
        status: "pending",
        OR: [{ requesterId: beto.id }, { addresseeId: beto.id }],
      },
    });

    vi.mocked(prisma.friendship.deleteMany).mockResolvedValueOnce({ count: 0 } as never);
    response = await request(app)
      .delete(`/friends/requests/${friendship.id}`)
      .set("Authorization", authenticated("third-party"));
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("FRIEND_REQUEST_NOT_FOUND");
  });

  it("GET /friends lista solo amistades aceptadas desde ambos lados", async () => {
    vi.mocked(prisma.friendship.findMany).mockResolvedValueOnce([
      { ...friendship, status: "accepted" },
    ] as never);
    const response = await request(app).get("/friends").set("Authorization", authenticated());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      friends: [{ id: beto.id, name: beto.name, username: beto.username }],
    });
  });
});
