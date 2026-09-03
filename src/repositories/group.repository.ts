// Capa de acceso a datos para la entidad Grupo y sus relaciones de membresía.

import { prisma } from "../infrastructure/prisma.js";

export interface Group {
  id: string;
  name: string;
}

// Proyección segura del usuario miembro sin exponer la password
export interface GroupMemberUser {
  id: string;
  name: string;
  username: string;
  email: string;
}

export interface GroupMemberWithUser {
  userId: string;
  groupId: string;
  user: GroupMemberUser;
}

export interface GroupWithMembers extends Group {
  members: GroupMemberWithUser[]; // --> Agrega la coleccion de miembros a un grupo
}

export interface GroupRepository {
  findById(id: string): Promise<GroupWithMembers | null>;
  isMember(groupId: string, userId: string): Promise<boolean>;
  create(data: { name: string }): Promise<Group>;
}

export const groupRepository: GroupRepository = {
  // --> Busca un grupo por su ID e incluye la lista de miembros con sus datos canónicos de usuario. Retorna null si el grupo no existe.

  async findById(id: string): Promise<GroupWithMembers | null> {
    return await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
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
  async isMember(groupId: string, userId: string): Promise<boolean> {
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
      select: {
        userId: true,
      },
    });

    return membership !== null;
  },

  // Crea grupo sin miembros inicialmente
  async create(data: { name: string }): Promise<Group> {
    return prisma.group.create({
      data: {
        name: data.name,
      },
      select: {
        id: true,
        name: true,
      },
    });
  },
};
