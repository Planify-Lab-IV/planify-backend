export interface Grupo {
  id: string;
  nombre: string;
}

export interface GrupoRepository {
  findById(id: string): Promise<Grupo | null>; // --> Grupo si completa, null si no

  create(data: { nombre: string }): Promise<Grupo>;
}
