export interface Participante {
  id: string;
  eventoId: string;
  username: string;
  esAnonimo: boolean;
}

export interface ParticipanteRepository {
  findById(id: string): Promise<Participante | null>; // --> Participante si completa, null si no
  findByEventoId(eventoId: string): Promise<Participante[]>;

  create(data: { eventoId: string; username: string; esAnonimo?: boolean }): Promise<Participante>;
}
