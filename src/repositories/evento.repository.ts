// Si se crea un nuevo grupo, se insertan membresías, se crea el evento y se crean los participantes en una unica transaccion de datos
import { prisma } from "../infrastructure/prisma.js";

export interface ParticipanteEvento {
  id: string;
  eventoId: string;
  usuarioId: string | null;
  username: string;
  esAnonimo: boolean;
  esOrganizador: boolean;
}

export interface EventoCreado {
  id: string;
  grupoId: string;
  creatorId: string | null;
  nombre: string;
  textPlace: string | null;
  estado: string;
  createdAt: Date;
  updatedAt: Date;
  participantes: ParticipanteEvento[];
}

export interface CreateEventParams {
  nombre: string;
  textPlace?: string | undefined;
  creatorId: string;
  grupoId?: string | undefined;
  nuevoGrupo?:
    | {
        nombre: string;
        miembrosIds: string[];
      }
    | undefined;
  participantes: {
    usuarioId: string;
    username: string;
    esOrganizador: boolean;
  }[];
}

export interface EventoRepository {
  findById(id: string): Promise<EventoCreado | null>;
  createAtomic(params: CreateEventParams): Promise<EventoCreado>;
}

export const eventoRepository: EventoRepository = {
  async findById(id: string): Promise<EventoCreado | null> {
    return prisma.evento.findUnique({
      where: { id },
      include: {
        participantes: true,
      },
    });
  },

  // Ejecuta la creación atómica: si viene nuevoGrupo crea el grupo y sus miembros,
  // luego crea el evento y asocia los participantes.
  async createAtomic(params: CreateEventParams): Promise<EventoCreado> {
    return prisma.$transaction(async (tx) => {
      let finalGrupoId = params.grupoId;

      // --> Si es nuevo el grupo, se crea junto a sus membresias
      if (params.nuevoGrupo) {
        const grupo = await tx.grupo.create({
          data: {
            nombre: params.nuevoGrupo.nombre,
            miembros: {
              create: params.nuevoGrupo.miembrosIds.map((uId) => ({
                usuarioId: uId,
              })),
            },
          },
        });
        finalGrupoId = grupo.id;
      }

      if (!finalGrupoId) {
        throw new Error("No se pudo determinar el grupo para el evento");
      }

      // --> Se crea el Evento junto a sus Participantes
      const evento = await tx.evento.create({
        data: {
          nombre: params.nombre,
          textPlace: params.textPlace ?? null,
          grupoId: finalGrupoId,
          creatorId: params.creatorId,
          participantes: {
            create: params.participantes.map((p) => ({
              usuarioId: p.usuarioId,
              username: p.username,
              esOrganizador: p.esOrganizador,
              esAnonimo: false,
            })),
          },
        },
        include: {
          participantes: true,
        },
      });

      return evento;
    });
  },
};
