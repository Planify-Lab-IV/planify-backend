import { describe, expect, it, vi } from "vitest";
import type {
  GroupMemberWithUser,
  GroupOverview,
  GroupRepository,
  GroupWithMembers,
} from "../src/repositories/group.repository.js";
import { createGroupService } from "../src/services/group.service.js";
import { ForbiddenError, NotFoundError } from "../src/shared/errors/index.js";

function makeGroupMember(overrides: Partial<GroupMemberWithUser> = {}): GroupMemberWithUser {
  return {
    userId: "user-1",
    groupId: "group-1",
    user: {
      id: "user-1",
      name: "Ana",
      username: "ana",
      email: "ana@example.com",
    },
    ...overrides,
  };
}

function makeGroup(overrides: Partial<GroupWithMembers> = {}): GroupWithMembers {
  return {
    id: "group-1",
    name: "Amigos",
    members: [makeGroupMember()],
    ...overrides,
  };
}

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

function createFakeGroupRepository(
  initialGroups: GroupWithMembers[],
  overviews: GroupOverview[] = [],
): GroupRepository {
  const groups = initialGroups.map((group) => ({ ...group, members: [...group.members] }));

  return {
    findById: vi.fn(async (id) => groups.find((group) => group.id === id) ?? null),
    isMember: vi.fn(async (groupId, userId) =>
      (groups.find((group) => group.id === groupId)?.members ?? []).some(
        (member) => member.userId === userId,
      ),
    ),
    removeMember: vi.fn(async (groupId, userId) => {
      const group = groups.find((candidate) => candidate.id === groupId);
      if (group) {
        group.members = group.members.filter((member) => member.userId !== userId);
      }
    }),
    create: vi.fn(async (data) => {
      const group = { id: `group-${groups.length + 1}`, name: data.name };
      groups.push({ ...group, members: [] });
      return group;
    }),
    updateName: vi.fn(async (groupId, name) => {
      const group = groups.find((candidate) => candidate.id === groupId);
      if (!group) {
        throw new Error("Group not found");
      }

      group.name = name;
      return {
        id: group.id,
        name: group.name,
        memberCount: group.members.length,
      };
    }),
    findByUserId: vi.fn(async (userId) =>
      groups
        .filter((group) => group.members.some((member) => member.userId === userId))
        .map((group) => ({
          id: group.id,
          name: group.name,
          memberCount: group.members.length,
        })),
    ),
    findOverviewByUserId: vi.fn(async () => overviews),
  };
}

describe("GroupService.listMyGroupsOverview", () => {
  it("delegates the authenticated user id to the repository", async () => {
    const overviews = makeGroupOverview();
    const groupRepository = createFakeGroupRepository([], overviews);
    const service = createGroupService(groupRepository);

    await expect(service.listMyGroupsOverview("user-1")).resolves.toEqual(overviews);
    expect(groupRepository.findOverviewByUserId).toHaveBeenCalledWith("user-1");
    expect(groupRepository.findOverviewByUserId).toHaveBeenCalledTimes(1);
  });
});

describe("GroupService.leaveGroup", () => {
  it("removes only the authenticated user's membership", async () => {
    const groupRepository = createFakeGroupRepository([
      makeGroup({
        members: [
          makeGroupMember(),
          makeGroupMember({
            userId: "user-2",
            user: {
              id: "user-2",
              name: "Beto",
              username: "beto",
              email: "beto@example.com",
            },
          }),
        ],
      }),
    ]);
    const service = createGroupService(groupRepository);

    await expect(service.leaveGroup("group-1", "user-1")).resolves.toBeUndefined();

    expect(groupRepository.removeMember).toHaveBeenCalledWith("group-1", "user-1");
    await expect(service.listMyGroups("user-1")).resolves.toEqual([]);
    await expect(service.listMyGroups("user-2")).resolves.toEqual([
      { id: "group-1", name: "Amigos", memberCount: 1 },
    ]);
  });

  it("returns not found when the group does not exist", async () => {
    const groupRepository = createFakeGroupRepository([]);
    const service = createGroupService(groupRepository);

    await expect(service.leaveGroup("missing-group", "user-1")).rejects.toThrow(NotFoundError);
    expect(groupRepository.removeMember).not.toHaveBeenCalled();
  });

  it("returns forbidden when the user is not a member", async () => {
    const groupRepository = createFakeGroupRepository([
      makeGroup({ members: [makeGroupMember({ userId: "user-2" })] }),
    ]);
    const service = createGroupService(groupRepository);

    await expect(service.leaveGroup("group-1", "user-1")).rejects.toThrow(ForbiddenError);
    expect(groupRepository.removeMember).not.toHaveBeenCalled();
  });

  it("keeps an empty group after its last member leaves", async () => {
    const groupRepository = createFakeGroupRepository([makeGroup()]);
    const service = createGroupService(groupRepository);

    await service.leaveGroup("group-1", "user-1");

    await expect(groupRepository.findById("group-1")).resolves.toMatchObject({
      id: "group-1",
      members: [],
    });
  });

  it("returns forbidden when the same user leaves twice", async () => {
    const groupRepository = createFakeGroupRepository([makeGroup()]);
    const service = createGroupService(groupRepository);

    await service.leaveGroup("group-1", "user-1");

    await expect(service.leaveGroup("group-1", "user-1")).rejects.toThrow(ForbiddenError);
    expect(groupRepository.removeMember).toHaveBeenCalledTimes(1);
  });
});

describe("GroupService.renameGroup", () => {
  it("renames a group for one of its members", async () => {
    const groupRepository = createFakeGroupRepository([
      makeGroup({
        members: [
          makeGroupMember(),
          makeGroupMember({
            userId: "user-2",
            user: {
              id: "user-2",
              name: "Beto",
              username: "beto",
              email: "beto@example.com",
            },
          }),
        ],
      }),
    ]);
    const service = createGroupService(groupRepository);

    await expect(service.renameGroup("group-1", "user-1", "Familia")).resolves.toEqual({
      id: "group-1",
      name: "Familia",
      memberCount: 2,
    });

    expect(groupRepository.updateName).toHaveBeenCalledWith("group-1", "Familia");
    await expect(service.listMyGroups("user-2")).resolves.toEqual([
      { id: "group-1", name: "Familia", memberCount: 2 },
    ]);
  });

  it("allows renaming a group to its existing name", async () => {
    const groupRepository = createFakeGroupRepository([makeGroup()]);
    const service = createGroupService(groupRepository);

    await expect(service.renameGroup("group-1", "user-1", "Amigos")).resolves.toMatchObject({
      name: "Amigos",
    });
    expect(groupRepository.updateName).toHaveBeenCalledWith("group-1", "Amigos");
  });

  it("returns not found without updating when the group does not exist", async () => {
    const groupRepository = createFakeGroupRepository([]);
    const service = createGroupService(groupRepository);

    await expect(service.renameGroup("missing-group", "user-1", "Familia")).rejects.toThrow(
      NotFoundError,
    );
    expect(groupRepository.updateName).not.toHaveBeenCalled();
  });

  it("returns forbidden without updating when the user is not a member", async () => {
    const groupRepository = createFakeGroupRepository([
      makeGroup({ members: [makeGroupMember({ userId: "user-2" })] }),
    ]);
    const service = createGroupService(groupRepository);

    await expect(service.renameGroup("group-1", "user-1", "Familia")).rejects.toThrow(
      ForbiddenError,
    );
    expect(groupRepository.updateName).not.toHaveBeenCalled();
  });

  it("returns forbidden after the user has left the group", async () => {
    const groupRepository = createFakeGroupRepository([makeGroup()]);
    const service = createGroupService(groupRepository);

    await service.leaveGroup("group-1", "user-1");

    await expect(service.renameGroup("group-1", "user-1", "Familia")).rejects.toThrow(
      ForbiddenError,
    );
    expect(groupRepository.updateName).not.toHaveBeenCalled();
  });
});
