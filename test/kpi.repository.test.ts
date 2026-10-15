import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    event: {
      count: vi.fn(),
    },
    eventParticipant: {
      groupBy: vi.fn(),
    },
  },
}));

import { prisma } from "../src/infrastructure/prisma.js";
import { kpiRepository } from "../src/repositories/kpi.repository.js";

const day = "2026-10-13";
const createdAt = {
  gte: new Date("2026-10-01T03:00:00.000Z"),
  lt: new Date("2026-10-14T03:00:00.000Z"),
};

describe("KpiRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cuenta todos los eventos creados en el mes hasta el final del día", async () => {
    vi.mocked(prisma.event.count).mockResolvedValueOnce(4);

    await expect(kpiRepository.countEventsCreatedMonthToDate(day)).resolves.toBe(4);

    expect(prisma.event.count).toHaveBeenCalledWith({
      where: { createdAt },
    });
  });

  it("cuenta eventos con dos o más participantes reales", async () => {
    vi.mocked(prisma.eventParticipant.groupBy).mockResolvedValueOnce([
      { eventId: "event-1", _count: { eventId: 2 } },
      { eventId: "event-2", _count: { eventId: 3 } },
    ]);

    await expect(kpiRepository.countEventsWithMultipleParticipants(day)).resolves.toBe(2);

    expect(prisma.eventParticipant.groupBy).toHaveBeenCalledWith({
      by: ["eventId"],
      where: {
        event: { createdAt },
      },
      _count: { eventId: true },
      having: {
        eventId: {
          _count: { gte: 2 },
        },
      },
    });
  });

  it("cuenta actividad persistida sin considerar deudas simplificadas", async () => {
    vi.mocked(prisma.event.count).mockResolvedValueOnce(3);

    await expect(kpiRepository.countEventsWithActivity(day)).resolves.toBe(3);

    expect(prisma.event.count).toHaveBeenCalledWith({
      where: {
        createdAt,
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
                availabilitySlots: { some: {} },
              },
            },
          },
          { expense: { some: {} } },
          { Task: { some: {} } },
        ],
      },
    });
  });
});
