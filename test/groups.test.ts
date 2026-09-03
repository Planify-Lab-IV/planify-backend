import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    groupMember: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /me/groups", () => {
  const authenticatedUserId = "user-1";
  const validToken = jwt.sign({ sub: authenticatedUserId }, env.JWT_SECRET);

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
