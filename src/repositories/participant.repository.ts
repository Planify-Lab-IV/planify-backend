export interface Participant {
  id: string;
  eventId: string;
  username: string;
  isAnonymous: boolean;
}

export interface ParticipantRepository {
  findById(id: string): Promise<Participant | null>; // --> Participante si completa, null si no
  findByEventId(eventId: string): Promise<Participant[]>;

  create(data: { eventId: string; username: string; isAnonymous?: boolean }): Promise<Participant>;
}
