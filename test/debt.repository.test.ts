import { beforeEach, describe, expect, it, vi } from "vitest";
import { debtRepository } from "../src/repositories/debt.repository.js";
import { prisma } from "../src/infrastructure/prisma.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    simplifiedDebt: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("DebtRepository.findById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("obtiene una deuda con deudor y acreedor", async () => {
    const record = {
      id: "debt-1",
      eventId: "event-1",
      amountCents: 1500,
      status: "pending" as const,
      settledAt: null,
      createdAt: new Date("2026-09-20T00:00:00.000Z"),
      debtor: { id: "participant-ana", username: "ana" },
      creditor: { id: "participant-beto", username: "beto" },
    };

    vi.mocked(prisma.simplifiedDebt.findUnique).mockResolvedValueOnce(record as never);

    await expect(debtRepository.findById("debt-1")).resolves.toEqual(record);

    expect(prisma.simplifiedDebt.findUnique).toHaveBeenCalledWith({
      where: { id: "debt-1" },
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
    });
  });

  it("devuelve null si la deuda no existe", async () => {
    vi.mocked(prisma.simplifiedDebt.findUnique).mockResolvedValueOnce(null);

    await expect(debtRepository.findById("debt-inexistente")).resolves.toBeNull();
  });
});

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

describe("DebtRepository.findByUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("obtiene pendientes y saldadas de un usuario cuando ambos estados son solicitados", async () => {
    const records = [
      {
        amountCents: 1500,
        status: "settled" as const,
        eventId: "event-1",
        debtor: {
          id: "participant-ana",
          userId: "user-ana",
          username: "ana",
          user: { name: "Ana Pérez" },
        },
        creditor: {
          id: "participant-invitado",
          userId: null,
          username: "invitado",
          user: null,
        },
        event: { name: "Cena" },
      },
    ];

    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(records as never);

    await expect(
      debtRepository.findByUserId("user-ana", { statuses: ["pending", "settled"] }),
    ).resolves.toEqual([
      {
        debtor: {
          participantId: "participant-ana",
          userId: "user-ana",
          participantUsername: "ana",
          userName: "Ana Pérez",
        },
        creditor: {
          participantId: "participant-invitado",
          userId: null,
          participantUsername: "invitado",
          userName: null,
        },
        amountCents: 1500,
        status: "settled",
        eventId: "event-1",
        eventName: "Cena",
      },
    ]);

    expect(prisma.simplifiedDebt.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["pending", "settled"] },
        OR: [{ debtor: { userId: "user-ana" } }, { creditor: { userId: "user-ana" } }],
      },
      select: {
        amountCents: true,
        status: true,
        eventId: true,
        debtor: {
          select: {
            id: true,
            userId: true,
            username: true,
            user: { select: { name: true } },
          },
        },
        creditor: {
          select: {
            id: true,
            userId: true,
            username: true,
            user: { select: { name: true } },
          },
        },
        event: { select: { name: true } },
      },
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

describe("DebtRepository.markSettled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("actualiza solo una deuda pendiente y devuelve la cantidad de filas afectadas", async () => {
    const settledAt = new Date("2026-09-30T12:00:00.000Z");
    vi.mocked(prisma.simplifiedDebt.updateMany).mockResolvedValueOnce({ count: 1 } as never);

    await expect(debtRepository.markSettled("debt-1", settledAt)).resolves.toBe(1);

    expect(prisma.simplifiedDebt.updateMany).toHaveBeenCalledWith({
      where: { id: "debt-1", status: "pending" },
      data: { status: "settled", settledAt },
    });
  });

  it("devuelve cero si ninguna deuda pendiente coincide", async () => {
    vi.mocked(prisma.simplifiedDebt.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    await expect(debtRepository.markSettled("debt-1", new Date())).resolves.toBe(0);
  });
});

describe("DebtRepository debt settlement transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encuentra pendientes en ambas direcciones con una contraparte registrada", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "debt-1", eventId: "event-1" },
      { id: "debt-2", eventId: "event-2" },
    ]);

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ simplifiedDebt: { findMany } })) as never);

    const result = await debtRepository.withinTransaction((transaction) =>
      transaction.findPendingBetween("user-ana", { type: "user", userId: "user-marcos" }),
    );

    expect(result).toEqual([
      { id: "debt-1", eventId: "event-1" },
      { id: "debt-2", eventId: "event-2" },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
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
    ) => callback({ simplifiedDebt: { findMany } })) as never);

    await debtRepository.withinTransaction((transaction) =>
      transaction.findPendingBetween("user-ana", {
        type: "participant",
        participantId: "participant-invitado",
      }),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
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
    ) => callback({ simplifiedDebt: { updateMany } })) as never);

    await expect(
      debtRepository.withinTransaction((transaction) =>
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
    ) => callback({ simplifiedDebt: { updateMany } })) as never);

    await expect(
      debtRepository.withinTransaction((transaction) =>
        transaction.markManySettled([], new Date()),
      ),
    ).resolves.toBe(0);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("devuelve los eventos que todavía tienen deudas pendientes", async () => {
    const findMany = vi.fn().mockResolvedValue([{ eventId: "event-2" }]);

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ simplifiedDebt: { findMany } })) as never);

    await expect(
      debtRepository.withinTransaction((transaction) =>
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
