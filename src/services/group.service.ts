import type {
  GroupOverview,
  GroupRepository,
  GroupSummary,
} from "../repositories/group.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { FriendService } from "./friend.service.js";
import { ForbiddenError, NotFoundError } from "../shared/errors/index.js";

export interface GroupService {
  listMyGroups(userId: string): Promise<GroupSummary[]>;
  listMyGroupsOverview(userId: string): Promise<GroupOverview[]>;
  leaveGroup(groupId: string, userId: string): Promise<void>;
  renameGroup(groupId: string, userId: string, name: string): Promise<GroupSummary>;
  addMember(groupId: string, requesterId: string, userId: string): Promise<void>;
}

export function createGroupService(
  groupRepository: GroupRepository,
  friendService: FriendService,
  userRepository: UserRepository,
): GroupService {
  async function ensureGroupMember(groupId: string, userId: string): Promise<void> {
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new NotFoundError("Grupo no encontrado");
    }

    const isMember = group.members.some((member) => member.userId === userId);
    if (!isMember) {
      throw new ForbiddenError("No pertenecés a este grupo");
    }
  }

  return {
    async listMyGroups(userId: string): Promise<GroupSummary[]> {
      // -_> Lista los grupos de un user autenticado
      return groupRepository.findByUserId(userId);
    },

    async listMyGroupsOverview(userId: string): Promise<GroupOverview[]> {
      return groupRepository.findOverviewByUserId(userId);
    },

    async leaveGroup(groupId: string, userId: string): Promise<void> {
      await ensureGroupMember(groupId, userId);
      await groupRepository.removeMember(groupId, userId);
    },

    async renameGroup(groupId: string, userId: string, name: string): Promise<GroupSummary> {
      await ensureGroupMember(groupId, userId);
      return groupRepository.updateName(groupId, name);
    },

    async addMember(groupId: string, requesterId: string, userId: string): Promise<void> {
      await ensureGroupMember(groupId, requesterId);

      const user = await userRepository.findById(userId);
      if (!user) {
        throw new NotFoundError("Usuario no encontrado");
      }

      if (!(await friendService.areFriends(requesterId, userId))) {
        throw new ForbiddenError("Solo podés agregar a tus amigos");
      }

      await groupRepository.addMemberWithActiveEvents(groupId, user);
    },
  };
}
