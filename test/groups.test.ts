import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    group: {
      findMany: vi.fn(),
    },
    groupMember: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /me/groups", () => {
  const authenticatedUserId = "user-1";
  const validToken = createSessionTokenService(env.JWT_SECRET).sign(authenticatedUserId);

  beforeEach(() => {
    vi.clearAllMocks();
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
