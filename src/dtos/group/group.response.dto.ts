import type { GroupSummary } from "../../repositories/group.repository.js";

export interface GroupResponseDTO {
  id: string;
  name: string;
  memberCount: number;
}

export function toGroupResponseDTO(group: GroupSummary): GroupResponseDTO {
  return {
    id: group.id,
    name: group.name,
    memberCount: group.memberCount,
  };
}
