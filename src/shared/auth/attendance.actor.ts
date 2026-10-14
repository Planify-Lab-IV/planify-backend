// --> Representa la identidad autenticada que puede responder asistencia.
export type AttendanceActor =
  | { type: "user"; userId: string }
  | { type: "anonymousParticipant"; participantId: string; eventId: string };
