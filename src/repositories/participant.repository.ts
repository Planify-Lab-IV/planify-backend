import { prisma } from "../infrastructure/prisma.js";
import type { AttendanceState } from "@prisma/client";

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

// --> Proyeccion especifica para el flujo de asistencia
export interface AttendanceParticipant {
  id: string;
  eventId: string;
  userId: string | null;
  username: string;
  isAnonymous: boolean;
  isOrganizer: boolean;
  attendanceState: AttendanceState;
}

export interface ParticipantRepository {
  findById(id: string): Promise<Participant | null>;

  findByEventId(eventId: string): Promise<Participant[]>;

  findByEventIdAndUsername(
    eventId: string,
    username: string,
  ): Promise<ParticipantWithPinHash | null>;

  findAttendanceById(id: string): Promise<AttendanceParticipant | null>;

  createAnonymous(data: {
    eventId: string;
    username: string;
    pinHash: string;
  }): Promise<Participant>;

  updateAttendance(id: string, state: AttendanceState): Promise<AttendanceParticipant>;

  invalidateAnonymousSessions(eventId: string): Promise<void>;
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

  async findAttendanceById(id) {
    return prisma.eventParticipant.findUnique({
      where: { id },
      select: {
        id: true,
        eventId: true,
        userId: true,
        username: true,
        isAnonymous: true,
        isOrganizer: true,
        attendanceState: true,
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

  async updateAttendance(id, state) {
    return prisma.eventParticipant.update({
      where: { id },
      data: { attendanceState: state },
      select: {
        id: true,
        eventId: true,
        userId: true,
        username: true,
        isAnonymous: true,
        isOrganizer: true,
        attendanceState: true,
      },
    });
  },

  async invalidateAnonymousSessions(eventId) {
    await prisma.eventParticipant.updateMany({
      where: {
        eventId,
        isAnonymous: true,
      },
      data: {
        pinHash: null,
      },
    });
  },
};
