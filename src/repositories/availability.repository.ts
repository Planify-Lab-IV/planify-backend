import { prisma } from "../infrastructure/prisma.js";

export interface AvailabilitySlot {
  participantId: string;
  eventId: string;
  weekDay: number;
  hourBlock: number;
}

export type AvailabilitySlotInput = Omit<AvailabilitySlot, "participantId" | "eventId">;

export interface AvailabilityHeatmapSlot {
  weekDay: number;
  hourBlock: number;
  availableCount: number;
}

export interface AvailabilityRepository {
  replaceForParticipant(
    eventId: string,
    participantId: string,
    slots: AvailabilitySlotInput[],
  ): Promise<void>;

  findForParticipant(eventId: string, participantId: string): Promise<AvailabilitySlot[]>;

  findHeatmapByEventId(eventId: string): Promise<AvailabilityHeatmapSlot[]>;
}

export const availabilityRepository: AvailabilityRepository = {
  async replaceForParticipant(eventId, participantId, slots) {
    await prisma.$transaction(async (tx) => {
      await tx.availabilitySlot.deleteMany({
        where: { eventId, participantId }, // --> Borra la carga anterior se ese participante es un evento
      });

      if (slots.length > 0) {
        await tx.availabilitySlot.createMany({
          data: slots.map((slot) => ({
            // --> La reemplaza por la nueva
            eventId,
            participantId,
            weekDay: slot.weekDay,
            hourBlock: slot.hourBlock,
          })),
        });
      }
    });
  },

  async findForParticipant(eventId, participantId) {
    return prisma.availabilitySlot.findMany({
      where: { eventId, participantId },
      select: {
        participantId: true,
        eventId: true,
        weekDay: true,
        hourBlock: true,
      },
      orderBy: [{ weekDay: "asc" }, { hourBlock: "asc" }],
    });
  },

  // --> Cuenta filas en la db
  async findHeatmapByEventId(eventId) {
    const groupedSlots = await prisma.availabilitySlot.groupBy({
      by: ["weekDay", "hourBlock"],
      where: { eventId },
      _count: { participantId: true },
      orderBy: [{ weekDay: "asc" }, { hourBlock: "asc" }],
    });

    return groupedSlots.map((slot) => ({
      weekDay: slot.weekDay,
      hourBlock: slot.hourBlock,
      availableCount: slot._count.participantId,
    }));
  },
};
