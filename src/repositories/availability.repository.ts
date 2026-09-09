import { prisma } from "../infrastructure/prisma.js";

export interface AvailabilitySlot {
  participantId: string;
  eventId: string;
  weekDay: number;
  hourBlock: number;
}

export type AvailabilitySlotInput = Omit<AvailabilitySlot, "participantId" | "eventId">;

export interface AvailabilityRepository {
  replaceForParticipant(
    eventId: string,
    participantId: string,
    slots: AvailabilitySlotInput[],
  ): Promise<void>;

  findForParticipant(eventId: string, participantId: string): Promise<AvailabilitySlot[]>;
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
};
