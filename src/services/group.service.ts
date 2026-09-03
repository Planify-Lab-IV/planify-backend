import type { GroupSummary, GroupRepository } from "../repositories/group.repository.js";

export interface GroupService {
  listMyGroups(userId: string): Promise<GroupSummary[]>;
}

export function createGroupService(groupRepository: GroupRepository): GroupService {
  return {
    async listMyGroups(userId: string): Promise<GroupSummary[]> {
      // -_> Lista los grupos de un user autenticado
      return groupRepository.findByUserId(userId);
    },
  };
}
