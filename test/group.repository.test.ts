import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/infrastructure/prisma.js";
import { groupRepository } from "../src/repositories/group.repository.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe("GroupRepository.addMemberWithActiveEvents", () => {
  const user = {
    id: "user-2",
    name: "Beto",
    username: "beto",
    email: "beto@example.com",
    avatarUrl: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the membership and participants of active and confirmed events atomically", async () => {
    const createManyMemberships = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([{ id: "event-active" }, { id: "event-confirmed" }]);
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        groupMember: { createMany: createManyMemberships },
        event: { findMany },
        eventParticipant: { createMany },
      })) as never);

    await groupRepository.addMemberWithActiveEvents("group-1", user);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(createManyMemberships).toHaveBeenCalledWith({
      data: [{ groupId: "group-1", userId: "user-2" }],
      skipDuplicates: true,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { groupId: "group-1", status: { in: ["active", "confirmed"] } },
      select: { id: true },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: "event-active",
          userId: "user-2",
          username: "beto",
          isAnonymous: false,
          isOrganizer: false,
        },
        {
          eventId: "event-confirmed",
          userId: "user-2",
          username: "beto",
          isAnonymous: false,
          isOrganizer: false,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("does not create participants when the group has no active or confirmed events", async () => {
    const createManyMemberships = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([]);
    const createMany = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        groupMember: { createMany: createManyMemberships },
        event: { findMany },
        eventParticipant: { createMany },
      })) as never);

    await groupRepository.addMemberWithActiveEvents("group-1", user);

    expect(createManyMemberships).toHaveBeenCalledOnce();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("does not touch events when the membership already exists", async () => {
    const createManyMemberships = vi.fn().mockResolvedValue({ count: 0 });
    const findMany = vi.fn();
    const createMany = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        groupMember: { createMany: createManyMemberships },
        event: { findMany },
        eventParticipant: { createMany },
      })) as never);

    await groupRepository.addMemberWithActiveEvents("group-1", user);

    expect(createManyMemberships).toHaveBeenCalledOnce();
    expect(findMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("propagates participant creation failures so Prisma rolls back the membership", async () => {
    const createManyMemberships = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([{ id: "event-active" }]);
    const createMany = vi.fn().mockRejectedValue(new Error("constraint violation"));
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        groupMember: { createMany: createManyMemberships },
        event: { findMany },
        eventParticipant: { createMany },
      })) as never);

    await expect(groupRepository.addMemberWithActiveEvents("group-1", user)).rejects.toThrow(
      "constraint violation",
    );
    expect(createManyMemberships).toHaveBeenCalledOnce();
    expect(createMany).toHaveBeenCalledOnce();
  });
});
