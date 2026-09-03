import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import jwt from "jsonwebtoken";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    group: { findUnique: vi.fn(), create: vi.fn() },
    groupMember: { findUnique: vi.fn() },
    event: { create: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

describe("POST /events", () => {
  const organizerId = "user-organizer-1";
  const validToken = jwt.sign({ sub: organizerId }, env.JWT_SECRET);
  const organizer = {
    id: organizerId,
    name: "Organizer",
    username: "organizer",
    email: "organizer@test.com",
  };

  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    const response = await request(app).post("/events").send({
      name: "Birthday",
      location: "Ana's house",
      newGroupName: "Friends",
    });
    expect(response.status).toBe(401);
  });

  it.each([
    { name: "Event", location: "", groupId: "group-1" },
    { name: "Event", location: "Place", groupId: 123 },
    { name: "Event", location: "Place", newGroupName: 123 },
    { name: "Event", location: "Place", newGroupName: "Group", memberIdentifiers: "ana" },
    { nombre: "Event", location: "Place", newGroupName: "Group" },
  ])("rejects an invalid event body: %o", async (payload) => {
    const response = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
  });

  it("returns the public EventResponseDTO for an existing group", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(organizer as never);
    vi.mocked(prisma.group.findUnique).mockResolvedValueOnce({
      id: "group-1",
      name: "Test group",
      members: [{ userId: organizerId, groupId: "group-1", user: organizer }],
    } as never);

    const createdEvent = {
      id: "event-1",
      name: "Birthday",
      location: "Ana's house",
      groupId: "group-1",
      organizerId,
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      participants: [
        {
          id: "participant-1",
          eventId: "event-1",
          userId: organizerId,
          username: "organizer",
          isOrganizer: true,
          isAnonymous: false,
        },
      ],
    };
    const createEvent = vi.fn().mockResolvedValue(createdEvent);
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ event: { create: createEvent } })) as never);

    const response = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({ name: "Birthday", location: "Ana's house", groupId: "group-1" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: "event-1",
      name: "Birthday",
      location: "Ana's house",
      groupId: "group-1",
      organizerId,
      status: "active",
      participants: [
        {
          eventId: "event-1",
          userId: organizerId,
          username: "organizer",
          isAnonymous: false,
          isOrganizer: true,
        },
      ],
    });
    expect(response.body).not.toHaveProperty("nombre");
    expect(response.body.participants[0]).not.toHaveProperty("esOrganizador");
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Birthday", location: "Ana's house", organizerId }),
      }),
    );
  });

  it("resolves new group members by username or email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(organizer as never);
    const member = { id: "user-ana", name: "Ana", username: "ana", email: "ana@example.com" };
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(member as never);
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        group: { create: vi.fn().mockResolvedValue({ id: "group-new" }) },
        event: {
          create: vi.fn().mockResolvedValue({
            id: "event-new",
            name: "Party",
            location: "Club",
            groupId: "group-new",
            organizerId,
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
            participants: [],
          }),
        },
      })) as never);

    const response = await request(app)
      .post("/events")
      .set("Authorization", `Bearer ${validToken}`)
      .send({
        name: "Party",
        location: "Club",
        newGroupName: "Friends",
        memberIdentifiers: ["ana"],
      });

    expect(response.status).toBe(201);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ email: "ana" }, { username: "ana" }] } }),
    );
  });
});
