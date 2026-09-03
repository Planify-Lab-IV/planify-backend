import type { Event, EventStatus } from "../repositories/event.repository.js";

export interface EventParticipantResponseDTO {
  eventId: string;
  userId: string | null;
  username: string;
  isAnonymous: boolean;
  isOrganizer: boolean;
}

export interface EventResponseDTO {
  id: string;
  name: string;
  location: string;
  organizerId: string;
  groupId: string;
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
  participants: EventParticipantResponseDTO[];
}

export function toEventResponseDTO(event: Event): EventResponseDTO {
  return {
    id: event.id,
    name: event.name,
    location: event.location,
    organizerId: event.organizerId,
    groupId: event.groupId,
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    participants: event.participants.map((participant) => ({
      eventId: participant.eventId,
      userId: participant.userId,
      username: participant.username,
      isAnonymous: participant.isAnonymous,
      isOrganizer: participant.isOrganizer,
    })),
  };
}
