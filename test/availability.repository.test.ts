import { beforeEach, describe, expect, it, vi } from "vitest";
import { availabilityRepository } from "../src/repositories/availability.repository.js";
import { prisma } from "../src/infrastructure/prisma.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    availabilitySlot: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("AvailabilityRepository", () => {
  const eventId = "event-1";
  const participantId = "participant-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reemplaza la selección completa dentro de una transacción", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ availabilitySlot: { deleteMany, createMany } })) as never);

    await availabilityRepository.replaceForParticipant(eventId, participantId, [
      { weekDay: 0, hourBlock: 9 },
      { weekDay: 6, hourBlock: 22 },
    ]);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(deleteMany).toHaveBeenCalledWith({ where: { eventId, participantId } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { eventId, participantId, weekDay: 0, hourBlock: 9 },
        { eventId, participantId, weekDay: 6, hourBlock: 22 },
      ],
    });
  });

  it("permite reemplazar una selección por una grilla vacía", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const createMany = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ availabilitySlot: { deleteMany, createMany } })) as never);

    await availabilityRepository.replaceForParticipant(eventId, participantId, []);

    expect(deleteMany).toHaveBeenCalledWith({ where: { eventId, participantId } });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("propaga el error de la creación para que Prisma revierta la transacción", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const createMany = vi.fn().mockRejectedValue(new Error("constraint violation"));
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ availabilitySlot: { deleteMany, createMany } })) as never);

    await expect(
      availabilityRepository.replaceForParticipant(eventId, participantId, [
        {
          weekDay: 0,
          hourBlock: 9,
        },
      ]),
    ).rejects.toThrow("constraint violation");

    expect(deleteMany).toHaveBeenCalledOnce();
    expect(createMany).toHaveBeenCalledOnce();
  });

  it("devuelve los slots del participante ordenados por día y hora", async () => {
    const slots = [
      { participantId, eventId, weekDay: 0, hourBlock: 9 },
      { participantId, eventId, weekDay: 1, hourBlock: 18 },
    ];
    vi.mocked(prisma.availabilitySlot.findMany).mockResolvedValueOnce(slots as never);

    await expect(
      availabilityRepository.findForParticipant(eventId, participantId),
    ).resolves.toEqual(slots);

    expect(prisma.availabilitySlot.findMany).toHaveBeenCalledWith({
      where: { eventId, participantId },
      select: {
        participantId: true,
        eventId: true,
        weekDay: true,
        hourBlock: true,
      },
      orderBy: [{ weekDay: "asc" }, { hourBlock: "asc" }],
    });
  });
});
