import { describe, expect, it, vi } from "vitest";
import type {
  GroupMemberWithUser,
  GroupOverview,
  GroupRepository,
  GroupWithMembers,
} from "../src/repositories/group.repository.js";
import type { UserRepository } from "../src/repositories/user.repository.js";
import type { FriendService } from "../src/services/friend.service.js";
import { createGroupService as createBaseGroupService } from "../src/services/group.service.js";
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
    addMemberWithActiveEvents: vi.fn(async (groupId, user) => {
      const group = groups.find((candidate) => candidate.id === groupId);
      if (group) {
        group.members.push(
          makeGroupMember({
            groupId,
            userId: user.id,
            user: {
              id: user.id,
              name: user.name,
              username: user.username,
              email: user.email,
            },
          }),
        );
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

function createGroupService(groupRepository: GroupRepository) {
  return createBaseGroupService(
    groupRepository,
    { areFriends: vi.fn() } as unknown as FriendService,
    { findById: vi.fn() } as unknown as UserRepository,
  );
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

describe("GroupService.addMember", () => {
  function createAddMemberContext(options?: {
    groups?: GroupWithMembers[];
    friend?: boolean;
    user?: { id: string; name: string; username: string; email: string; avatarUrl: null } | null;
  }) {
    const groupRepository = createFakeGroupRepository(options?.groups ?? [makeGroup()]);
    const friendService = {
      areFriends: vi.fn().mockResolvedValue(options?.friend ?? true),
    } as unknown as FriendService;
    const userRepository = {
      findById: vi.fn().mockResolvedValue(
        options?.user === undefined
          ? {
              id: "user-2",
              name: "Beto",
              username: "beto",
              email: "beto@example.com",
              avatarUrl: null,
            }
          : options.user,
      ),
    } as unknown as UserRepository;

    return {
      groupRepository,
      friendService,
      userRepository,
      service: createBaseGroupService(groupRepository, friendService, userRepository),
    };
  }

  it("adds an existing friend and delegates the atomic persistence", async () => {
    const { service, groupRepository, friendService, userRepository } = createAddMemberContext();

    await expect(service.addMember("group-1", "user-1", "user-2")).resolves.toBeUndefined();

    expect(userRepository.findById).toHaveBeenCalledWith("user-2");
    expect(friendService.areFriends).toHaveBeenCalledWith("user-1", "user-2");
    expect(groupRepository.addMemberWithActiveEvents).toHaveBeenCalledWith(
      "group-1",
      expect.objectContaining({ id: "user-2", username: "beto" }),
    );
  });

  it("makes the new member see the group with its updated member count", async () => {
    const { service } = createAddMemberContext();

    await service.addMember("group-1", "user-1", "user-2");

    await expect(service.listMyGroups("user-2")).resolves.toEqual([
      { id: "group-1", name: "Amigos", memberCount: 2 },
    ]);
  });

  it("rejects a user who is not an accepted friend", async () => {
    const { service, groupRepository } = createAddMemberContext({ friend: false });

    await expect(service.addMember("group-1", "user-1", "user-2")).rejects.toThrow(
      "Solo podés agregar a tus amigos",
    );
    expect(groupRepository.addMemberWithActiveEvents).not.toHaveBeenCalled();
  });

  it("rejects a pending friendship because areFriends returns false", async () => {
    const { service, groupRepository, friendService } = createAddMemberContext({ friend: false });

    await expect(service.addMember("group-1", "user-1", "user-2")).rejects.toThrow(ForbiddenError);
    expect(friendService.areFriends).toHaveBeenCalledOnce();
    expect(groupRepository.addMemberWithActiveEvents).not.toHaveBeenCalled();
  });

  it("is idempotent when the user is already a member", async () => {
    const { service, groupRepository } = createAddMemberContext({
      groups: [
        makeGroup({
          members: [makeGroupMember(), makeGroupMember({ userId: "user-2" })],
        }),
      ],
    });

    await expect(service.addMember("group-1", "user-1", "user-2")).resolves.toBeUndefined();
    expect(groupRepository.addMemberWithActiveEvents).not.toHaveBeenCalled();
  });

  it("rejects a requester who is not a member", async () => {
    const { service, groupRepository, userRepository } = createAddMemberContext({
      groups: [makeGroup({ members: [makeGroupMember({ userId: "user-3" })] })],
    });

    await expect(service.addMember("group-1", "user-1", "user-2")).rejects.toThrow(ForbiddenError);
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(groupRepository.addMemberWithActiveEvents).not.toHaveBeenCalled();
  });

  it("rejects missing groups and users without persisting a membership", async () => {
    const missingGroup = createAddMemberContext({ groups: [] });
    await expect(missingGroup.service.addMember("missing", "user-1", "user-2")).rejects.toThrow(
      NotFoundError,
    );
    expect(missingGroup.groupRepository.addMemberWithActiveEvents).not.toHaveBeenCalled();

    const missingUser = createAddMemberContext({ user: null });
    await expect(missingUser.service.addMember("group-1", "user-1", "missing")).rejects.toThrow(
      NotFoundError,
    );
    expect(missingUser.groupRepository.addMemberWithActiveEvents).not.toHaveBeenCalled();
  });
});
