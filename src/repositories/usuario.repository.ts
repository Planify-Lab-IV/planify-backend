export interface Usuario {
  id: string;
  nombre: string;
  email: string;
}

export interface UsuarioRepository {
  findById(id: string): Promise<Usuario | null>; // --> Usuario si completa, null si no
  findByEmail(email: string): Promise<Usuario | null>;

  create(data: { nombre: string; email: string; passwordHash: string }): Promise<Usuario>;
}
