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

  it("obtiene deudas con deudor y acreedor, ordenadas por estado, monto e id", async () => {
    const records = [
      {
        id: "debt-pending-2",
        eventId: "event-1",
        amountCents: 1500,
        status: "pending" as const,
        settledAt: null,
        createdAt: new Date("2026-09-20T00:00:00.000Z"),
        debtor: { id: "participant-ana", username: "ana" },
        creditor: { id: "participant-beto", username: "beto" },
      },
      {
        id: "debt-settled-1",
        eventId: "event-1",
        amountCents: 500,
        status: "settled" as const,
        settledAt: new Date("2026-09-21T00:00:00.000Z"),
        createdAt: new Date("2026-09-20T00:00:00.000Z"),
        debtor: { id: "participant-cami", username: "cami" },
        creditor: { id: "participant-beto", username: "beto" },
      },
    ];

    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(records as never);

    await expect(debtRepository.findByEventId("event-1")).resolves.toEqual(records);

    expect(prisma.simplifiedDebt.findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      select: {
        id: true,
        eventId: true,
        amountCents: true,
        status: true,
        settledAt: true,
        createdAt: true,
        debtor: { select: { id: true, username: true } },
        creditor: { select: { id: true, username: true } },
      },
      orderBy: [{ status: "asc" }, { amountCents: "desc" }, { id: "asc" }],
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
        amountCents: 1500,
        status: "settled" as const,
        settledAt: new Date("2026-09-21T00:00:00.000Z"),
        createdAt: new Date("2026-09-20T00:00:00.000Z"),
        debtor: { id: "participant-ana", username: "ana" },
        creditor: { id: "participant-beto", username: "beto" },
      },
    ];

    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(settledRecords as never);

    await expect(debtRepository.findSettledByEventId("event-1")).resolves.toEqual(settledRecords);

    expect(prisma.simplifiedDebt.findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", status: "settled" },
      select: {
        id: true,
        eventId: true,
        amountCents: true,
        status: true,
        settledAt: true,
        createdAt: true,
        debtor: { select: { id: true, username: true } },
        creditor: { select: { id: true, username: true } },
      },
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
