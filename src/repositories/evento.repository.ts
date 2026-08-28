export interface Evento {
  id: string;
  grupoId: string;
  nombre: string;
  estado: string;
}

export interface EventoRepository {
  findById(id: string): Promise<Evento | null>; // --> Evento si completa, null si no
  findByGrupoId(grupoId: string): Promise<Evento[]>;

  create(data: { grupoId: string; nombre: string }): Promise<Evento>;
  updateEstado(id: string, estado: string): Promise<Evento>;
}
