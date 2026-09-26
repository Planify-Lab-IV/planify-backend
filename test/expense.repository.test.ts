import { beforeEach, describe, expect, it, vi } from "vitest";
import { expenseRepository } from "../src/repositories/expense.repository.js";
import { prisma } from "../src/infrastructure/prisma.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    expense: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("ExpenseRepository.createAtomic", () => {
  const params = {
    eventId: "event-1",
    description: "Cena",
    totalAmountCents: 4500,
    createdByParticipantId: "participant-creator",
    payers: [
      { participantId: "participant-ana", amountCents: 3000 },
      { participantId: "participant-beto", amountCents: 1500 },
    ],
    debtors: [
      { participantId: "participant-ana", amountCents: 1500 },
      { participantId: "participant-beto", amountCents: 1500 },
      { participantId: "participant-cami", amountCents: 1500 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea el gasto, sus acreedores y deudores dentro de una transacción", async () => {
    const expense = {
      id: "expense-1",
      ...params,
      createdAt: new Date("2026-09-19T00:00:00.000Z"),
      payers: params.payers.map((payer) => ({ ...payer, expenseId: "expense-1" })),
      debtors: params.debtors.map((debtor) => ({ ...debtor, expenseId: "expense-1" })),
    };
    const create = vi.fn().mockResolvedValue(expense);
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ expense: { create } })) as never);

    await expect(expenseRepository.createAtomic(params)).resolves.toEqual(expense);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      data: {
        eventId: params.eventId,
        description: params.description,
        totalAmountCents: params.totalAmountCents,
        createdByParticipantId: params.createdByParticipantId,
        payers: { create: params.payers },
        debtors: { create: params.debtors },
      },
      include: {
        payers: true,
        debtors: true,
      },
    });
  });

  it("propaga el error de Prisma para que la transacción revierta", async () => {
    const create = vi.fn().mockRejectedValue(new Error("constraint violation"));
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) => callback({ expense: { create } })) as never);

    await expect(expenseRepository.createAtomic(params)).rejects.toThrow("constraint violation");
    expect(create).toHaveBeenCalledOnce();
  });
});

describe("ExpenseRepository.findByEventId", () => {
  it("obtiene los gastos del evento con sus aportantes y deudores", async () => {
    const expenses = [
      {
        id: "expense-1",
        eventId: "event-1",
        description: "Cena",
        totalAmountCents: 4500,
        createdByParticipantId: "participant-creator",
        createdAt: new Date("2026-09-19T00:00:00.000Z"),
        payers: [{ expenseId: "expense-1", participantId: "participant-ana", amountCents: 4500 }],
        debtors: [{ expenseId: "expense-1", participantId: "participant-beto", amountCents: 4500 }],
      },
    ];

    vi.mocked(prisma.expense.findMany).mockResolvedValueOnce(expenses as never);

    await expect(expenseRepository.findByEventId("event-1")).resolves.toEqual(expenses);

    expect(prisma.expense.findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1" },
      include: {
        payers: true,
        debtors: true,
      },
      orderBy: { createdAt: "asc" },
    });
  });
});
