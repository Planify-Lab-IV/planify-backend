import type { ActivityLogEntry } from "../../repositories/activity-log.repository.js";

export interface ActivityLogResponseDTO {
  id: string;
  type: ActivityLogEntry["type"];
  actor: {
    participantId: string;
    username: string;
  };
  payload: ActivityLogEntry["payload"];
  createdAt: Date;
}

export function toActivityLogResponseDTO(entry: ActivityLogEntry): ActivityLogResponseDTO {
  return {
    id: entry.id,
    type: entry.type,
    actor: {
      participantId: entry.actor.id,
      username: entry.actor.username,
    },
    payload: entry.payload,
    createdAt: entry.createdAt,
  };
}
