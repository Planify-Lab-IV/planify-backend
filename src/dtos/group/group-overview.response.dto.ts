import type { EventStatus } from "../../repositories/event.repository.js";
import type { GroupOverview } from "../../repositories/group.repository.js";

export interface GroupOverviewEventResponseDTO {
  id: string;
  name: string;
  status: EventStatus;
  startDateTime: Date | null;
  location: string;
}

export interface GroupOverviewResponseDTO {
  id: string;
  name: string;
  memberCount: number;
  events: GroupOverviewEventResponseDTO[];
}

export function toGroupOverviewResponseDTO(group: GroupOverview): GroupOverviewResponseDTO {
  return {
    id: group.id,
    name: group.name,
    memberCount: group.memberCount,
    events: group.events.map((event) => ({
      id: event.id,
      name: event.name,
      status: event.status,
      startDateTime: event.startDateTime,
      location: event.location,
    })),
  };
}
