// Capa de acceso a datos para la entidad Grupo y sus relaciones de membresía.

import { prisma } from "../infrastructure/prisma.js";

export interface Grupo {
  id: string;
  nombre: string;
}

// Proyección segura del usuario miembro sin exponer la password
export interface UsuarioMiembro {
  id: string;
  nombre: string;
  email: string;
}

export interface MiembroConUsuario {
  usuarioId: string;
  grupoId: string;
  usuario: UsuarioMiembro;
}

export interface GrupoConMiembros extends Grupo {
  miembros: MiembroConUsuario[]; // --> Agrega la coleccion de miembros a un grupo
}

export interface GrupoRepository {
  findById(id: string): Promise<GrupoConMiembros | null>;
  isMember(grupoId: string, usuarioId: string): Promise<boolean>;
  create(data: { nombre: string }): Promise<Grupo>;
}

export const grupoRepository: GrupoRepository = {
  // --> Busca un grupo por su ID e incluye la lista de miembros con sus datos canónicos de usuario. Retorna null si el grupo no existe.

  async findById(id: string): Promise<GrupoConMiembros | null> {
    return await prisma.grupo.findUnique({
      where: { id },
      include: {
        miembros: {
          include: {
            usuario: {
              select: {
                id: true,
                nombre: true,
                email: true,
              },
            },
          },
        },
      },
    });
  },

  // Verifica de manera directa y óptima si un usuario pertenece a un grupo,
  // aprovechando el índice de la clave primaria compuesta @@id([usuarioId, grupoId]).
  async isMember(grupoId: string, usuarioId: string): Promise<boolean> {
    const membership = await prisma.miembroGrupo.findUnique({
      where: {
        usuarioId_grupoId: {
          usuarioId,
          grupoId,
        },
      },
      select: {
        usuarioId: true,
      },
    });

    return membership !== null;
  },

  // Crea grupo sin miembros inicialmente
  async create(data: { nombre: string }): Promise<Grupo> {
    return prisma.grupo.create({
      data: {
        nombre: data.nombre,
      },
      select: {
        id: true,
        nombre: true,
      },
    });
  },
};
