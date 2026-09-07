import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    invitation: { create: vi.fn(), findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

describe("invitations", () => {
  const eventId = "event-1";
  const organizerId = "organizer-1";
  const otherUserId = "other-user-1";
  const validInvitationToken = "a".repeat(43);
  const organizerToken = createSessionTokenService(env.JWT_SECRET).sign(organizerId);
  const otherUserToken = createSessionTokenService(env.JWT_SECRET).sign(otherUserId);
  const event = {
    id: eventId,
    groupId: "group-1",
    organizerId,
    name: "Cumpleaños",
    location: "Casa de Ana",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    participants: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication to create an invitation", async () => {
    const response = await request(app).post(`/events/${eventId}/invitations`).send({});

    expect(response.status).toBe(401);
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it("creates an invitation URL with a unique opaque token", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(event as never);
    vi.mocked(prisma.invitation.create).mockImplementation(async (args) => {
      const data = args.data as { eventId: string; uniqueToken: string; expiresAt: Date | null };
      return {
        id: "invitation-1",
        ...data,
        status: "active",
      } as never;
    });

    const firstResponse = await request(app)
      .post(`/events/${eventId}/invitations`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({});
    const secondResponse = await request(app)
      .post(`/events/${eventId}/invitations`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({});

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(firstResponse.body.invitationUrl).toMatch(/^planify:\/\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(secondResponse.body.invitationUrl).toMatch(/^planify:\/\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(firstResponse.body.invitationUrl).not.toBe(secondResponse.body.invitationUrl);
    expect(firstResponse.body.invitationUrl).not.toContain(eventId);
    expect(prisma.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId,
          expiresAt: null,
          uniqueToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        }),
      }),
    );
  });

  it("forbids a non-organizer from creating an invitation", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(event as never);

    const response = await request(app)
      .post(`/events/${eventId}/invitations`)
      .set("Authorization", `Bearer ${otherUserToken}`)
      .send({});

    expect(response.status).toBe(403);
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it("rejects an expired invitation date", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue(event as never);

    const response = await request(app)
      .post(`/events/${eventId}/invitations`)
      .set("Authorization", `Bearer ${organizerToken}`)
      .send({ expiresAt: "2020-01-01T00:00:00.000Z" });

    expect(response.status).toBe(400);
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it("resolves an active, unexpired token without authentication", async () => {
    vi.mocked(prisma.invitation.findUnique).mockResolvedValue({
      id: "invitation-1",
      eventId,
      uniqueToken: validInvitationToken,
      expiresAt: null,
      status: "active",
    } as never);

    const response = await request(app).get(`/invitations/${validInvitationToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ eventId });
    expect(response.body).not.toHaveProperty("uniqueToken");
  });

  it("rejects an invalid token without querying persistence", async () => {
    const response = await request(app).get("/invitations/not-a-valid-token");

    expect(response.status).toBe(400);
    expect(prisma.invitation.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent token", async () => {
    vi.mocked(prisma.invitation.findUnique).mockResolvedValue(null);

    const response = await request(app).get(`/invitations/${validInvitationToken}`);

    expect(response.status).toBe(404);
  });

  it("rejects an expired token", async () => {
    vi.mocked(prisma.invitation.findUnique).mockResolvedValue({
      id: "invitation-1",
      eventId,
      uniqueToken: validInvitationToken,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      status: "active",
    } as never);

    const response = await request(app).get(`/invitations/${validInvitationToken}`);

    expect(response.status).toBe(404);
  });

  it("rejects a cancelled token", async () => {
    vi.mocked(prisma.invitation.findUnique).mockResolvedValue({
      id: "invitation-1",
      eventId,
      uniqueToken: validInvitationToken,
      expiresAt: null,
      status: "cancelled",
    } as never);

    const response = await request(app).get(`/invitations/${validInvitationToken}`);

    expect(response.status).toBe(404);
  });
});
