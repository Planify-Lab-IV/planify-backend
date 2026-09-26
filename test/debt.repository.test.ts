import { beforeEach, describe, expect, it, vi } from "vitest";
import { debtRepository } from "../src/repositories/debt.repository.js";
import { prisma } from "../src/infrastructure/prisma.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    simplifiedDebt: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("DebtRepository.findByEventId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("obtiene todas las deudas del evento ordenadas por fecha de creación", async () => {
    const records = [
      {
        id: "debt-1",
        eventId: "event-1",
        debtorParticipantId: "participant-ana",
        creditorParticipantId: "participant-beto",
        amountCents: 1500,
        status: "pending" as const,
        settledAt: null,
        createdAt: new Date("2026-09-20T00:00:00.000Z"),
      },
    ];

    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(records as never);

    await expect(debtRepository.findByEventId("event-1")).resolves.toEqual(records);

    expect(prisma.simplifiedDebt.findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("DebtRepository.findSettledByEventId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("obtiene solo las deudas saldadas del evento", async () => {
    const settledRecords = [
      {
        id: "debt-1",
        eventId: "event-1",
        debtorParticipantId: "participant-ana",
        creditorParticipantId: "participant-beto",
        amountCents: 1500,
        status: "settled" as const,
        settledAt: new Date("2026-09-21T00:00:00.000Z"),
        createdAt: new Date("2026-09-20T00:00:00.000Z"),
      },
    ];

    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(settledRecords as never);

    await expect(debtRepository.findSettledByEventId("event-1")).resolves.toEqual(settledRecords);

    expect(prisma.simplifiedDebt.findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", status: "settled" },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("DebtRepository.replacePendingForEvent", () => {
  const eventId = "event-1";
  const debts = [
    {
      debtorParticipantId: "participant-ana",
      creditorParticipantId: "participant-beto",
      amountCents: 1500,
    },
    {
      debtorParticipantId: "participant-cami",
      creditorParticipantId: "participant-beto",
      amountCents: 1000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("elimina las deudas pendientes previas y crea las nuevas dentro de una transacción", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn().mockResolvedValue({ count: 2 });

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        simplifiedDebt: { deleteMany, createMany },
      })) as never);

    await expect(debtRepository.replacePendingForEvent(eventId, debts)).resolves.toBeUndefined();

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(deleteMany).toHaveBeenCalledWith({
      where: { eventId, status: "pending" },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: debts.map((debt) => ({
        eventId,
        debtorParticipantId: debt.debtorParticipantId,
        creditorParticipantId: debt.creditorParticipantId,
        amountCents: debt.amountCents,
        status: "pending",
      })),
    });
  });

  it("elimina las pendientes y no ejecuta createMany si la lista de deudas está vacía", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        simplifiedDebt: { deleteMany, createMany },
      })) as never);

    await expect(debtRepository.replacePendingForEvent(eventId, [])).resolves.toBeUndefined();

    expect(deleteMany).toHaveBeenCalledWith({
      where: { eventId, status: "pending" },
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("propaga el error si la transacción falla para que revierta", async () => {
    const deleteMany = vi.fn().mockRejectedValue(new Error("DB error"));
    const createMany = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        simplifiedDebt: { deleteMany, createMany },
      })) as never);

    await expect(debtRepository.replacePendingForEvent(eventId, debts)).rejects.toThrow("DB error");
  });
});
