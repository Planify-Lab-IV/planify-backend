import type {
  GroupOverview,
  GroupRepository,
  GroupSummary,
} from "../repositories/group.repository.js";

export interface GroupService {
  listMyGroups(userId: string): Promise<GroupSummary[]>;
  listMyGroupsOverview(userId: string): Promise<GroupOverview[]>;
}

export function createGroupService(groupRepository: GroupRepository): GroupService {
  return {
    async listMyGroups(userId: string): Promise<GroupSummary[]> {
      // -_> Lista los grupos de un user autenticado
      return groupRepository.findByUserId(userId);
    },

    async listMyGroupsOverview(userId: string): Promise<GroupOverview[]> {
      return groupRepository.findOverviewByUserId(userId);
    },
  };
}
