import { prisma } from "../infrastructure/prisma.js";

export interface EventParticipant {
  id: string;
  eventId: string;
  userId: string | null;
  username: string;
  isAnonymous: boolean;
  isOrganizer: boolean;
}

export const eventStatuses = ["active", "confirmed", "cancelled"] as const;
export type EventStatus = (typeof eventStatuses)[number];

function parseEventStatus(status: string): EventStatus {
  if ((eventStatuses as readonly string[]).includes(status)) {
    return status as EventStatus;
  }

  throw new Error(`Invalid event status in persistence: ${status}`);
}

export interface Event {
  id: string;
  groupId: string;
  organizerId: string;
  name: string;
  location: string;
  status: EventStatus;
  startDateTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
  participants: EventParticipant[];
}

export interface CreateEventParams {
  name: string;
  location: string;
  organizerId: string;
  groupId?: string;
  newGroup?: {
    name: string;
    memberIds: string[];
  };
  participants: {
    userId: string;
    username: string;
    isOrganizer: boolean;
  }[];
}

export interface EventRepository {
  findById(id: string): Promise<Event | null>;
  createAtomic(params: CreateEventParams): Promise<Event>;
  cancelAtomic(id: string): Promise<Event>;
  confirmSchedule(id: string, startDateTime: Date): Promise<Event>;
}

export const eventRepository: EventRepository = {
  async findById(id: string): Promise<Event | null> {
    const event = await prisma.event.findUnique({
      where: { id },
      include: { participants: true },
    });

    return event ? { ...event, status: parseEventStatus(event.status) } : null;
  },

  async createAtomic(params: CreateEventParams): Promise<Event> {
    return prisma.$transaction(async (tx) => {
      let finalGroupId = params.groupId;

      if (params.newGroup) {
        const group = await tx.group.create({
          data: {
            name: params.newGroup.name,
            members: {
              create: params.newGroup.memberIds.map((userId) => ({ userId })),
            },
          },
        });
        finalGroupId = group.id;
      }

      if (!finalGroupId) {
        throw new Error("Unable to determine the event group");
      }

      const event = await tx.event.create({
        data: {
          name: params.name,
          location: params.location,
          groupId: finalGroupId,
          organizerId: params.organizerId,
          participants: {
            create: params.participants.map((participant) => ({
              userId: participant.userId,
              username: participant.username,
              isOrganizer: participant.isOrganizer,
              isAnonymous: false,
            })),
          },
        },
        include: { participants: true },
      });

      // trae las propiedades del evento (...event), y sobreescribe el status con una version validada
      return { ...event, status: parseEventStatus(event.status) };
    });
  },

  async cancelAtomic(id: string): Promise<Event> {
    return prisma.$transaction(async (tx) => {
      const event = await tx.event.update({
        where: { id },
        data: { status: "cancelled" },
        include: { participants: true },
      });

      await tx.eventParticipant.updateMany({
        where: {
          eventId: id,
          isAnonymous: true,
        },
        data: {
          pinHash: null,
        },
      });

      return { ...event, status: parseEventStatus(event.status) };
    });
  },

  // --> Establece el evento como confirmado junto al horario de comienzo
  async confirmSchedule(id: string, startDateTime: Date): Promise<Event> {
    const event = await prisma.event.update({
      where: { id },
      data: {
        status: "confirmed",
        startDateTime,
      },
      include: { participants: true },
    });

    return { ...event, status: parseEventStatus(event.status) };
  },
};
