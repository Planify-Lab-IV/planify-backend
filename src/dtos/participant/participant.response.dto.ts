import type { AttendanceParticipant } from "../../repositories/participant.repository.js";

export interface ParticipantResponseDTO {
  id: string;
  eventId: string;
  username: string;
  isAnonymous: boolean;
  isOrganizer: boolean;
  attendanceState: AttendanceParticipant["attendanceState"];
}

export function toParticipantResponseDTO(
  participant: AttendanceParticipant,
): ParticipantResponseDTO {
  return {
    id: participant.id,
    eventId: participant.eventId,
    username: participant.username,
    isAnonymous: participant.isAnonymous,
    isOrganizer: participant.isOrganizer,
    attendanceState: participant.attendanceState,
  };
}
