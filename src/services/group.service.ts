import type {
  GroupOverview,
  GroupRepository,
  GroupSummary,
} from "../repositories/group.repository.js";
import { ForbiddenError, NotFoundError } from "../shared/errors/index.js";

export interface GroupService {
  listMyGroups(userId: string): Promise<GroupSummary[]>;
  listMyGroupsOverview(userId: string): Promise<GroupOverview[]>;
  leaveGroup(groupId: string, userId: string): Promise<void>;
  renameGroup(groupId: string, userId: string, name: string): Promise<GroupSummary>;
}

export function createGroupService(groupRepository: GroupRepository): GroupService {
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
  };
}
