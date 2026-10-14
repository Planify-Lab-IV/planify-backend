import { prisma } from "../infrastructure/prisma.js";
import { getArgentinaDayRange } from "../shared/time/argentina-date.js";

export interface KpiRepository {
  countEventsCreatedMonthToDate(day: string): Promise<number>;
  countEventsWithMultipleParticipants(day: string): Promise<number>;
  countEventsWithActivity(day: string): Promise<number>;
}

export const kpiRepository: KpiRepository = {
  async countEventsCreatedMonthToDate(day: string): Promise<number> {
    return prisma.event.count({
      where: {
        createdAt: getBusinessWindow(day),
      },
    });
  },

  async countEventsWithMultipleParticipants(day: string): Promise<number> {
    const events = await prisma.eventParticipant.groupBy({
      by: ["eventId"],
      where: {
        event: {
          createdAt: getBusinessWindow(day),
        },
      },
      _count: {
        eventId: true,
      },
      having: {
        eventId: {
          _count: {
            gte: 2,
          },
        },
      },
    });

    return events.length;
  },

  async countEventsWithActivity(day: string): Promise<number> {
    return prisma.event.count({
      where: {
        createdAt: getBusinessWindow(day),
        OR: [
          {
            participants: {
              some: {
                attendanceState: { not: "not_confirmed" },
              },
            },
          },
          {
            participants: {
              some: {
                availabilitySlots: {
                  some: {},
                },
              },
            },
          },
          { expense: { some: {} } },
          { Task: { some: {} } },
        ],
      },
    });
  },
};

function getBusinessWindow(day: string): { gte: Date; lt: Date } {
  const monthStartDay = `${day.slice(0, 7)}-01`;

  return {
    gte: getArgentinaDayRange(monthStartDay).startUtc,
    lt: getArgentinaDayRange(day).endUtc,
  };
}
