import { describe, expect, it, vi } from "vitest";
import type { GroupOverview, GroupRepository } from "../src/repositories/group.repository.js";
import { createGroupService } from "../src/services/group.service.js";

function makeGroupOverview(): GroupOverview[] {
  return [
    {
      id: "group-1",
      name: "Amigos",
      memberCount: 4,
      events: [
        {
          id: "event-1",
          name: "Asado",
          status: "confirmed",
          startDateTime: new Date("2026-10-10T20:00:00.000Z"),
          location: "Casa de Ana",
        },
      ],
    },
  ];
}

function createGroupRepository(overviews: GroupOverview[]): GroupRepository {
  return {
    findById: vi.fn(),
    isMember: vi.fn(),
    create: vi.fn(),
    findByUserId: vi.fn(),
    findOverviewByUserId: vi.fn(async () => overviews),
  };
}

describe("GroupService.listMyGroupsOverview", () => {
  it("delegates the authenticated user id to the repository", async () => {
    const overviews = makeGroupOverview();
    const groupRepository = createGroupRepository(overviews);
    const service = createGroupService(groupRepository);

    await expect(service.listMyGroupsOverview("user-1")).resolves.toEqual(overviews);
    expect(groupRepository.findOverviewByUserId).toHaveBeenCalledWith("user-1");
    expect(groupRepository.findOverviewByUserId).toHaveBeenCalledTimes(1);
  });
});
