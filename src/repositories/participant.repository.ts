import { prisma } from "../infrastructure/prisma.js";

export class ParticipantAlreadyExistsError extends Error {
  constructor() {
    super("Ya existe un participante con ese nombre en el evento");
    this.name = "ParticipantAlreadyExistsError";
  } // --> Error interno, no tiene porque estar centralizado
}

export interface Participant {
  id: string;
  eventId: string;
  username: string;
  isAnonymous: boolean;
}

// --> Solo se usa cuando el sistema necesita validar el PIN de ingreso
export interface ParticipantWithPinHash extends Participant {
  pinHash: string | null;
}

export interface ParticipantRepository {
  findById(id: string): Promise<Participant | null>;

  findByEventId(eventId: string): Promise<Participant[]>;

  findByEventIdAndUsername(
    eventId: string,
    username: string,
  ): Promise<ParticipantWithPinHash | null>;

  createAnonymous(data: {
    eventId: string;
    username: string;
    pinHash: string;
  }): Promise<Participant>;
}

export const participantRepository: ParticipantRepository = {
  async findById(id) {
    return prisma.eventParticipant.findUnique({
      where: { id },
      select: {
        id: true,
        eventId: true,
        username: true,
        isAnonymous: true,
      },
    });
  },

  async findByEventId(eventId) {
    return prisma.eventParticipant.findMany({
      where: { eventId },
      select: {
        id: true,
        eventId: true,
        username: true,
        isAnonymous: true,
      },
    });
  },

  async findByEventIdAndUsername(eventId, username) {
    return prisma.eventParticipant.findUnique({
      where: {
        eventId_username: { eventId, username },
      },
      select: {
        id: true,
        eventId: true,
        username: true,
        isAnonymous: true,
        pinHash: true,
      },
    });
  },

  async createAnonymous({ eventId, username, pinHash }) {
    try {
      return await prisma.eventParticipant.create({
        data: {
          eventId,
          username,
          pinHash,
          isAnonymous: true,
          isOrganizer: false,
        },
        select: {
          id: true,
          eventId: true,
          username: true,
          isAnonymous: true,
          // --> No exponemos el pinHash al crear un participante no registrado, no circula fuera de la
          // operacion directa de crear
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ParticipantAlreadyExistsError();
      }

      throw error;
    }
  },
};
