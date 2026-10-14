import type { ActivityType, Prisma } from "@prisma/client";
import { prisma } from "../infrastructure/prisma.js";

export interface ActivityLog {
  id: string;
  eventId: string;
  type: ActivityType;
  actorParticipantId: string;
  // guarda los datos específicos de cada tipo de actividad para que el
  // feed pueda mostrar que paso sin consultar a la entidad original
  payload: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface ActivityLogEntry extends ActivityLog {
  actor: {
    id: string;
    username: string;
  };
}

export interface CreateActivityLogParams {
  eventId: string;
  type: ActivityType;
  actorParticipantId: string;
  payload: Prisma.InputJsonValue;
}

export interface CountUnreadActivityLogParams {
  eventId: string;
  since: Date | null;
  excludeActorParticipantId: string;
}

export interface ActivityLogRepository {
  create(params: CreateActivityLogParams): Promise<ActivityLog>;
  findByEventId(eventId: string): Promise<ActivityLogEntry[]>;
  countUnread(params: CountUnreadActivityLogParams): Promise<number>;
}

export const activityLogRepository: ActivityLogRepository = {
  async create(params) {
    return prisma.activityLog.create({
      data: params,
    });
  },

  async findByEventId(eventId) {
    return prisma.activityLog.findMany({
      where: { eventId },
      select: {
        id: true,
        eventId: true,
        type: true,
        actorParticipantId: true,
        payload: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  async countUnread({ eventId, since, excludeActorParticipantId }) {
    return prisma.activityLog.count({
      where: {
        eventId,
        actorParticipantId: { not: excludeActorParticipantId },
        ...(since ? { createdAt: { gt: since } } : {}),
      },
    });
  },
};
