import type { UnreadCounts } from "../../services/activity-log.service.js";

export interface UnreadCountsResponseDTO {
  events: {
    eventId: string;
    groupId: string;
    unreadCount: number;
  }[];
  groups: {
    groupId: string;
    unreadCount: number;
  }[];
}

export function toUnreadCountsResponseDTO(counts: UnreadCounts): UnreadCountsResponseDTO {
  return counts;
}
