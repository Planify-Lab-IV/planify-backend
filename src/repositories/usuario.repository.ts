// Capa de acceso a datos para la entidad Usuario.
// Es el único lugar que interactúa con Prisma para usuarios.

import { prisma } from "../infrastructure/prisma.js";

// --> Usuario canónico / público (sin datos sensibles)
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
}

// --> Usuario interno para autenticación (incluye el hash)
export interface UsuarioConPassword extends Usuario {
  passwordHash: string;
}

export interface UsuarioRepository {
  findById(id: string): Promise<Usuario | null>;
  findByEmail(email: string): Promise<Usuario | null>;
  findPublicByIdentifier(identifier: string): Promise<Usuario | null>;
  findByIdentifier(identifier: string): Promise<UsuarioConPassword | null>;
  create(data: { nombre: string; email: string; passwordHash: string }): Promise<Usuario>;
}

export const usuarioRepository: UsuarioRepository = {
  async findById(id: string): Promise<Usuario | null> {
    const user = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true, email: true },
    });
    return user;
  },

  async findByEmail(email: string): Promise<Usuario | null> {
    const user = await prisma.usuario.findUnique({
      where: { email },
      select: { id: true, nombre: true, email: true },
    });
    return user;
  },

  // Busca un usuario por email o nombre sin exponer datos de autenticación.
  async findPublicByIdentifier(identifier: string): Promise<Usuario | null> {
    const user = await prisma.usuario.findFirst({
      where: {
        OR: [{ email: identifier }, { nombre: identifier }],
      },
      select: { id: true, nombre: true, email: true },
    });

    return user;
  },

  // Búsqueda exclusiva para autenticación: incluye el hash de la contraseña.
  async findByIdentifier(identifier: string): Promise<UsuarioConPassword | null> {
    const user = await prisma.usuario.findFirst({
      where: {
        OR: [{ email: identifier }, { nombre: identifier }],
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      passwordHash: user.passwordHash,
    };
  },

  async create(data: { nombre: string; email: string; passwordHash: string }): Promise<Usuario> {
    return await prisma.usuario.create({
      data,
      select: { id: true, nombre: true, email: true },
    });
  },
};
