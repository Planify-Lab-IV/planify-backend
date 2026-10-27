import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/infrastructure/prisma.js";
import { groupRepository } from "../src/repositories/group.repository.js";

const createdGroupIds: string[] = [];
const createdUserIds: string[] = [];
const createdEventIds: string[] = [];

afterEach(async () => {
  await prisma.event.deleteMany({ where: { id: { in: createdEventIds.splice(0) } } });
  await prisma.group.deleteMany({ where: { id: { in: createdGroupIds.splice(0) } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
});

describe("GroupRepository.addMemberWithActiveEvents concurrency", () => {
  it("does not fail when the same member is added concurrently", async () => {
    const organizer = await createTestUser("organizer");
    const member = await createTestUser("member");
    const group = await prisma.group.create({
      data: {
        id: randomUUID(),
        name: "Concurrent group membership",
        members: { create: { userId: organizer.id } },
      },
    });
    createdGroupIds.push(group.id);
    const event = await prisma.event.create({
      data: {
        id: randomUUID(),
        name: "Concurrent active event",
        location: "Test location",
        groupId: group.id,
        organizerId: organizer.id,
        participants: {
          create: {
            userId: organizer.id,
            username: organizer.username,
            isAnonymous: false,
            isOrganizer: true,
          },
        },
      },
    });
    createdEventIds.push(event.id);

    const results = await Promise.allSettled([
      groupRepository.addMemberWithActiveEvents(group.id, member),
      groupRepository.addMemberWithActiveEvents(group.id, member),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    await expect(
      prisma.groupMember.count({ where: { groupId: group.id, userId: member.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.eventParticipant.count({ where: { eventId: event.id, userId: member.id } }),
    ).resolves.toBe(1);
  });
});

async function createTestUser(prefix: string) {
  const id = randomUUID();
  createdUserIds.push(id);
  return prisma.user.create({
    data: {
      id,
      name: `${prefix} group test`,
      username: `${prefix}-group-${id}`,
      email: `${prefix}-group-${id}@planify.test`,
      passwordHash: "not-used-by-this-test",
    },
    select: { id: true, name: true, username: true, email: true, avatarUrl: true },
  });
}
