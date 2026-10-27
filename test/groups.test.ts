import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    friendship: { findUnique: vi.fn() },
    group: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    groupMember: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    event: { findMany: vi.fn() },
    eventParticipant: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

describe("GET /me/groups", () => {
  const authenticatedUserId = "user-1";
  const validToken = createSessionTokenService(env.JWT_SECRET).sign(authenticatedUserId);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
  });

  it("returns only the authenticated user's groups", async () => {
    vi.mocked(prisma.groupMember.findMany).mockResolvedValueOnce([
      {
        group: {
          id: "group-1",
          name: "Football",
          _count: {
            members: 4,
          },
        },
      },
      {
        group: {
          id: "group-2",
          name: "Study group",
          _count: {
            members: 2,
          },
        },
      },
    ] as never);

    const response = await request(app)
      .get("/me/groups")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: "group-1",
        name: "Football",
        memberCount: 4,
      },
      {
        id: "group-2",
        name: "Study group",
        memberCount: 2,
      },
    ]);

    expect(prisma.groupMember.findMany).toHaveBeenCalledWith({
      where: {
        userId: authenticatedUserId,
      },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                members: true,
              },
            },
          },
        },
      },
    });
  });

  it("returns an empty list when the authenticated user has no groups", async () => {
    vi.mocked(prisma.groupMember.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get("/me/groups")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("ignores a userId provided by the client", async () => {
    vi.mocked(prisma.groupMember.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get("/me/groups?userId=another-user")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: authenticatedUserId,
        },
      }),
    );
  });

  it("returns 401 when the token is missing", async () => {
    const response = await request(app).get("/me/groups");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("returns 401 when the token is invalid", async () => {
    const response = await request(app)
      .get("/me/groups")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });
});

describe("GET /me/groups/overview", () => {
  const authenticatedUserId = "user-1";
  const validToken = createSessionTokenService(env.JWT_SECRET).sign(authenticatedUserId);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
  });

  it("returns the authenticated user's groups with their visible events", async () => {
    vi.mocked(prisma.group.findMany).mockResolvedValueOnce([
      {
        id: "group-1",
        name: "Amigos",
        _count: { members: 4 },
        events: [
          {
            id: "event-1",
            name: "Asado",
            status: "confirmed",
            startDateTime: new Date("2026-10-10T20:00:00.000Z"),
            location: "Casa de Ana",
          },
          {
            id: "event-2",
            name: "Juntada pendiente",
            status: "active",
            startDateTime: null,
            location: "Bar del barrio",
          },
        ],
      },
      {
        id: "group-2",
        name: "Familia",
        _count: { members: 2 },
        events: [],
      },
    ] as never);

    const response = await request(app)
      .get("/me/groups/overview")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: "group-1",
        name: "Amigos",
        memberCount: 4,
        events: [
          {
            id: "event-1",
            name: "Asado",
            status: "confirmed",
            startDateTime: "2026-10-10T20:00:00.000Z",
            location: "Casa de Ana",
          },
          {
            id: "event-2",
            name: "Juntada pendiente",
            status: "active",
            startDateTime: null,
            location: "Bar del barrio",
          },
        ],
      },
      {
        id: "group-2",
        name: "Familia",
        memberCount: 2,
        events: [],
      },
    ]);
    expect(prisma.group.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.group.findMany).toHaveBeenCalledWith({
      where: {
        members: {
          some: { userId: authenticatedUserId },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            members: true,
          },
        },
        events: {
          where: {
            status: {
              in: ["active", "confirmed"],
            },
          },
          orderBy: [{ startDateTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            status: true,
            startDateTime: true,
            location: true,
          },
        },
      },
    });
  });

  it("filters cancelled events in the repository query", async () => {
    vi.mocked(prisma.group.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get("/me/groups/overview")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          events: expect.objectContaining({
            where: {
              status: {
                in: ["active", "confirmed"],
              },
            },
          }),
        }),
      }),
    );
  });

  it("returns an empty list when the authenticated user has no groups", async () => {
    vi.mocked(prisma.group.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get("/me/groups/overview")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("ignores a userId provided by the client", async () => {
    vi.mocked(prisma.group.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get("/me/groups/overview?userId=another-user")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          members: {
            some: { userId: authenticatedUserId },
          },
        },
      }),
    );
  });

  it("returns 401 when the token is missing", async () => {
    const response = await request(app).get("/me/groups/overview");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("returns 401 when the token is invalid", async () => {
    const response = await request(app)
      .get("/me/groups/overview")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });
});

describe("DELETE /groups/:groupId/members/me", () => {
  const authenticatedUserId = "user-1";
  const validToken = createSessionTokenService(env.JWT_SECRET).sign(authenticatedUserId);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
  });

  it("removes the authenticated user's membership", async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Amigos",
      members: [{ userId: authenticatedUserId }],
    } as never);
    vi.mocked(prisma.groupMember.deleteMany).mockResolvedValueOnce({ count: 1 } as never);

    const response = await request(app)
      .delete("/groups/group-1/members/me")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(prisma.groupMember.deleteMany).toHaveBeenCalledWith({
      where: { groupId: "group-1", userId: authenticatedUserId },
    });
  });

  it("returns 404 when the group does not exist", async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null);

    const response = await request(app)
      .delete("/groups/missing-group/members/me")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: "NOT_FOUND", message: "Grupo no encontrado" });
    expect(prisma.groupMember.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the authenticated user is not a member", async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Amigos",
      members: [{ userId: "user-2" }],
    } as never);

    const response = await request(app)
      .delete("/groups/group-1/members/me")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: "FORBIDDEN",
      message: "No pertenecés a este grupo",
    });
    expect(prisma.groupMember.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the user leaves the same group twice", async () => {
    vi.mocked(prisma.group.findUnique)
      .mockResolvedValueOnce({
        id: "group-1",
        name: "Amigos",
        members: [{ userId: authenticatedUserId }],
      } as never)
      .mockResolvedValueOnce({
        id: "group-1",
        name: "Amigos",
        members: [],
      } as never);
    vi.mocked(prisma.groupMember.deleteMany).mockResolvedValueOnce({ count: 1 } as never);

    const firstResponse = await request(app)
      .delete("/groups/group-1/members/me")
      .set("Authorization", `Bearer ${validToken}`);
    const secondResponse = await request(app)
      .delete("/groups/group-1/members/me")
      .set("Authorization", `Bearer ${validToken}`);

    expect(firstResponse.status).toBe(204);
    expect(secondResponse.status).toBe(403);
    expect(prisma.groupMember.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when the token is missing", async () => {
    const response = await request(app).delete("/groups/group-1/members/me");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });
});

describe("PATCH /groups/:groupId", () => {
  const authenticatedUserId = "user-1";
  const validToken = createSessionTokenService(env.JWT_SECRET).sign(authenticatedUserId);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
  });

  it("renames a group for an authenticated member", async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Amigos",
      members: [{ userId: authenticatedUserId }],
    } as never);
    vi.mocked(prisma.group.update).mockResolvedValueOnce({
      id: "group-1",
      name: "Familia",
      _count: { members: 3 },
    } as never);

    const response = await request(app)
      .patch("/groups/group-1")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ name: "  Familia  " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: "group-1", name: "Familia", memberCount: 3 });
    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: { name: "Familia" },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            members: true,
          },
        },
      },
    });
  });

  it("returns 404 when the group does not exist", async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null);

    const response = await request(app)
      .patch("/groups/missing-group")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ name: "Familia" });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: "NOT_FOUND", message: "Grupo no encontrado" });
    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the authenticated user is not a member", async () => {
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Amigos",
      members: [{ userId: "user-2" }],
    } as never);

    const response = await request(app)
      .patch("/groups/group-1")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ name: "Familia" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: "FORBIDDEN",
      message: "No pertenecés a este grupo",
    });
    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { name: "" },
    { name: "   " },
    { name: "a".repeat(81) },
    { name: "Familia", extra: true },
  ])("returns 400 and does not update for an invalid body: %o", async (body) => {
    const response = await request(app)
      .patch("/groups/group-1")
      .set("Authorization", `Bearer ${validToken}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(prisma.group.findUnique).not.toHaveBeenCalled();
    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it("returns 401 when the token is missing", async () => {
    const response = await request(app).patch("/groups/group-1").send({ name: "Familia" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.group.update).not.toHaveBeenCalled();
  });
});

describe("POST /groups/:groupId/members", () => {
  const authenticatedUserId = "user-1";
  const validToken = createSessionTokenService(env.JWT_SECRET).sign(authenticatedUserId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockAuthenticatedRequester() {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ passwordChangedAt: null } as never);
  }

  function mockAtomicMemberInsert() {
    const create = vi.fn().mockResolvedValue({});
    const findMany = vi.fn().mockResolvedValue([{ id: "event-active" }]);
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        groupMember: { create },
        event: { findMany },
        eventParticipant: { createMany },
      })) as never);
    return { create, findMany, createMany };
  }

  it("adds an accepted friend and materializes them in active group events", async () => {
    mockAuthenticatedRequester();
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Amigos",
      members: [{ userId: authenticatedUserId }],
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-2",
      name: "Beto",
      username: "beto",
      email: "beto@example.com",
      avatarUrl: null,
    } as never);
    vi.mocked(prisma.friendship.findUnique).mockResolvedValueOnce({ status: "accepted" } as never);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValueOnce(null);
    const transaction = mockAtomicMemberInsert();

    const response = await request(app)
      .post("/groups/group-1/members")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ userId: "user-2" });

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(transaction.create).toHaveBeenCalledWith({
      data: { groupId: "group-1", userId: "user-2" },
    });
    expect(transaction.createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: "event-active",
          userId: "user-2",
          username: "beto",
          isAnonymous: false,
          isOrganizer: false,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("returns 204 without creating duplicate rows when the friend is already a member", async () => {
    mockAuthenticatedRequester();
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Amigos",
      members: [{ userId: authenticatedUserId }],
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: "user-2",
      name: "Beto",
      username: "beto",
      email: "beto@example.com",
      avatarUrl: null,
    } as never);
    vi.mocked(prisma.friendship.findUnique).mockResolvedValueOnce({ status: "accepted" } as never);
    vi.mocked(prisma.groupMember.findUnique).mockResolvedValueOnce({ userId: "user-2" } as never);

    const response = await request(app)
      .post("/groups/group-1/members")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ userId: "user-2" });

    expect(response.status).toBe(204);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([{ status: "pending" }, null])(
    "returns 403 and does not persist when friendship is not accepted: %o",
    async (friendship) => {
      mockAuthenticatedRequester();
      vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
        id: "group-1",
        name: "Amigos",
        members: [{ userId: authenticatedUserId }],
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "user-2",
        name: "Beto",
        username: "beto",
        email: "beto@example.com",
        avatarUrl: null,
      } as never);
      vi.mocked(prisma.friendship.findUnique).mockResolvedValueOnce(friendship as never);

      const response = await request(app)
        .post("/groups/group-1/members")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ userId: "user-2" });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: "FORBIDDEN",
        message: "Solo podés agregar a tus amigos",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it("returns 403 when the requester does not belong to the group", async () => {
    mockAuthenticatedRequester();
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Amigos",
      members: [{ userId: "user-3" }],
    } as never);

    const response = await request(app)
      .post("/groups/group-1/members")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ userId: "user-2" });

    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing group or user", async () => {
    mockAuthenticatedRequester();
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce(null);
    const missingGroup = await request(app)
      .post("/groups/missing/members")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ userId: "user-2" });

    expect(missingGroup.status).toBe(404);
    expect(missingGroup.body).toMatchObject({ error: "NOT_FOUND", message: "Grupo no encontrado" });

    mockAuthenticatedRequester();
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Amigos",
      members: [{ userId: authenticatedUserId }],
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    const missingUser = await request(app)
      .post("/groups/group-1/members")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ userId: "missing" });

    expect(missingUser.status).toBe(404);
    expect(missingUser.body).toMatchObject({
      error: "NOT_FOUND",
      message: "Usuario no encontrado",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([{}, { userId: "" }, { userId: "user-2", extra: true }])(
    "returns 400 for an invalid body: %o",
    async (body) => {
      mockAuthenticatedRequester();

      const response = await request(app)
        .post("/groups/group-1/members")
        .set("Authorization", `Bearer ${validToken}`)
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("INVALID_DATA");
      expect(prisma.group.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it("returns 401 without an access token", async () => {
    const response = await request(app).post("/groups/group-1/members").send({ userId: "user-2" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
