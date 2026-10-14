// Capa de acceso a datos para la entidad Grupo y sus relaciones de membresía.

import { prisma } from "../infrastructure/prisma.js";
import { parseEventStatus, type EventStatus } from "./event.repository.js";

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

// Para tener la cantidad de miembros de un group
export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
}

export interface GroupOverviewEvent {
  id: string;
  name: string;
  status: EventStatus;
  startDateTime: Date | null;
  location: string;
}

export interface GroupOverview extends GroupSummary {
  events: GroupOverviewEvent[];
}

export interface GroupRepository {
  findById(id: string): Promise<GroupWithMembers | null>;
  isMember(groupId: string, userId: string): Promise<boolean>;
  create(data: { name: string }): Promise<Group>;
  findByUserId(userId: string): Promise<GroupSummary[]>;
  findOverviewByUserId(userId: string): Promise<GroupOverview[]>;
}

export const groupRepository: GroupRepository = {
  // --> Busca un grupo por su ID e incluye la lista de miembros con sus datos canónicos de usuario.
  // Retorna null si el grupo no existe.
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

  // --> Busca los grupos dado el usuario autenticado
  async findByUserId(userId: string): Promise<GroupSummary[]> {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                members: true,
              },
            },
          },
        },
      },
    });

    return memberships.map(({ group }) => ({
      id: group.id,
      name: group.name,
      memberCount: group._count.members,
    }));
  },

  async findOverviewByUserId(userId: string): Promise<GroupOverview[]> {
    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            members: true,
          },
        },
        events: {
          where: {
            status: {
              in: ["active", "confirmed"],
            },
          },
          orderBy: [{ startDateTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            status: true,
            startDateTime: true,
            location: true,
          },
        },
      },
    });

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      memberCount: group._count.members,
      events: group.events.map((event) => ({
        ...event,
        status: parseEventStatus(event.status),
      })),
    }));
  },
};
