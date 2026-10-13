import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/infrastructure/prisma.js";
import { eventBalanceRepository } from "../src/repositories/event-balance.repository.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe("EventBalanceRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloquea el evento antes de ejecutar la operación", async () => {
    const callOrder: string[] = [];
    const queryRaw = vi.fn(async () => {
      callOrder.push("lock");
      return [{ id: "event-1" }];
    });

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ $queryRaw: queryRaw })) as never);

    await expect(
      eventBalanceRepository.withinLockedTransaction("event-1", async () => {
        callOrder.push("operation");
        return "done";
      }),
    ).resolves.toBe("done");

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["lock", "operation"]);
  });

  it("expone operaciones financieras que usan el cliente de la transacción", async () => {
    const findExpenses = vi.fn().mockResolvedValue([]);
    const findFirst = vi.fn().mockResolvedValue(null);
    const findMany = vi.fn().mockResolvedValue([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        $queryRaw: vi.fn().mockResolvedValue([{ id: "event-1" }]),
        expense: { findMany: findExpenses },
        simplifiedDebt: { findFirst, findMany, updateMany, deleteMany, createMany },
      })) as never);

    await eventBalanceRepository.withinLockedTransaction("event-1", async (transaction) => {
      await transaction.findExpenses();
      await transaction.findDebt("debt-1");
      await transaction.findDebts();
      await transaction.findSettledDebts();
      await transaction.settleDebt("debt-1", new Date("2026-10-13T00:00:00.000Z"));
      await transaction.replacePendingDebts([
        {
          debtorParticipantId: "participant-ana",
          creditorParticipantId: "participant-beto",
          amountCents: 1500,
        },
      ]);
    });

    expect(findExpenses).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      include: { payers: true, debtors: true },
      orderBy: { createdAt: "asc" },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "debt-1", eventId: "event-1" } }),
    );
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "debt-1", eventId: "event-1", status: "pending" },
      data: { status: "settled", settledAt: new Date("2026-10-13T00:00:00.000Z") },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", status: "pending" },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: "event-1",
          debtorParticipantId: "participant-ana",
          creditorParticipantId: "participant-beto",
          amountCents: 1500,
          status: "pending",
        },
      ],
    });
  });
});
