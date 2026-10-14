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

describe("EventBalanceRepository multi-event settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloquea los eventos en orden estable y encuentra pendientes en ambas direcciones", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const findMany = vi.fn().mockResolvedValue([
      { id: "debt-1", eventId: "event-1" },
      { id: "debt-2", eventId: "event-2" },
    ]);

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ $queryRaw: queryRaw, simplifiedDebt: { findMany } })) as never);

    const result = await eventBalanceRepository.withinLockedEventsTransaction(
      ["event-2", "event-1", "event-2"],
      (transaction) =>
        transaction.findPendingBetween("user-ana", { type: "user", userId: "user-marcos" }),
    );

    expect(result).toEqual([
      { id: "debt-1", eventId: "event-1" },
      { id: "debt-2", eventId: "event-2" },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(queryRaw.mock.calls.map((call) => call[1])).toEqual(["event-1", "event-2"]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        eventId: { in: ["event-1", "event-2"] },
        status: "pending",
        OR: [
          { debtor: { userId: "user-ana" }, creditor: { userId: "user-marcos" } },
          { debtor: { userId: "user-marcos" }, creditor: { userId: "user-ana" } },
        ],
      },
      select: { id: true, eventId: true },
      orderBy: { id: "asc" },
    });
  });

  it("limita una contraparte anónima a su participante exacto", async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        simplifiedDebt: { findMany },
      })) as never);

    await eventBalanceRepository.withinLockedEventsTransaction(["event-1"], (transaction) =>
      transaction.findPendingBetween("user-ana", {
        type: "participant",
        participantId: "participant-invitado",
      }),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        eventId: { in: ["event-1"] },
        status: "pending",
        OR: [
          {
            debtor: { userId: "user-ana" },
            creditor: { id: "participant-invitado", userId: null, isAnonymous: true },
          },
          {
            debtor: { id: "participant-invitado", userId: null, isAnonymous: true },
            creditor: { userId: "user-ana" },
          },
        ],
      },
      select: { id: true, eventId: true },
      orderBy: { id: "asc" },
    });
  });

  it("marca únicamente la lista exacta de deudas pendientes", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const settledAt = new Date("2026-10-01T00:00:00.000Z");

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        simplifiedDebt: { updateMany },
      })) as never);

    await expect(
      eventBalanceRepository.withinLockedEventsTransaction(["event-1"], (transaction) =>
        transaction.markManySettled(["debt-1", "debt-2"], settledAt),
      ),
    ).resolves.toBe(2);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["debt-1", "debt-2"] }, status: "pending" },
      data: { status: "settled", settledAt },
    });
  });

  it("no ejecuta un update cuando no hay deudas", async () => {
    const updateMany = vi.fn();

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        simplifiedDebt: { updateMany },
      })) as never);

    await expect(
      eventBalanceRepository.withinLockedEventsTransaction(["event-1"], (transaction) =>
        transaction.markManySettled([], new Date()),
      ),
    ).resolves.toBe(0);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("devuelve los eventos que todavía tienen deudas pendientes", async () => {
    const findMany = vi.fn().mockResolvedValue([{ eventId: "event-2" }]);

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        $queryRaw: vi.fn().mockResolvedValue([]),
        simplifiedDebt: { findMany },
      })) as never);

    await expect(
      eventBalanceRepository.withinLockedEventsTransaction(["event-1", "event-2"], (transaction) =>
        transaction.findPendingEventIds(["event-1", "event-2"]),
      ),
    ).resolves.toEqual(["event-2"]);

    expect(findMany).toHaveBeenCalledWith({
      where: { eventId: { in: ["event-1", "event-2"] }, status: "pending" },
      select: { eventId: true },
      distinct: ["eventId"],
      orderBy: { eventId: "asc" },
    });
  });
});
