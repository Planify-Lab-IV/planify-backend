import { describe, expect, it, vi } from "vitest";
import type { Expense, ExpenseRepository } from "../src/repositories/expense.repository.js";
import type { DebtRepository, SimplifiedDebtRecord } from "../src/repositories/debt.repository.js";
import type { Event, EventRepository } from "../src/repositories/event.repository.js";
import {
  buildParticipantAmounts,
  createDebtService as createProductionDebtService,
} from "../src/services/debt.service.js";
import { ForbiddenError, NotFoundError } from "../src/shared/errors/index.js";

function makeExpense(
  id: string,
  eventId: string,
  payers: { participantId: string; amountCents: number }[],
  debtors: { participantId: string; amountCents: number }[],
): Expense {
  const totalAmountCents = payers.reduce((sum, p) => sum + p.amountCents, 0);
  return {
    id,
    eventId,
    description: `Gasto ${id}`,
    totalAmountCents,
    createdByParticipantId: payers[0]?.participantId ?? "creator",
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    payers: payers.map((p) => ({ ...p, expenseId: id })),
    debtors: debtors.map((d) => ({ ...d, expenseId: id })),
  };
}

function makeSettledDebt(
  id: string,
  eventId: string,
  debtorParticipantId: string,
  creditorParticipantId: string,
  amountCents: number,
): SimplifiedDebtRecord {
  return {
    id,
    eventId,
    amountCents,
    status: "settled",
    settledAt: new Date("2026-09-21T00:00:00.000Z"),
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    debtor: { id: debtorParticipantId, username: debtorParticipantId },
    creditor: { id: creditorParticipantId, username: creditorParticipantId },
  };
}

function createFakeExpenseRepository(initialExpenses: Expense[] = []): ExpenseRepository {
  const records = [...initialExpenses];
  return {
    createAtomic: vi.fn(),
    findByEventId: vi.fn(async (eventId) => records.filter((e) => e.eventId === eventId)),
  };
}

function createFakeDebtRepository(initialDebts: SimplifiedDebtRecord[] = []): DebtRepository & {
  getRecords: () => SimplifiedDebtRecord[];
} {
  let records = [...initialDebts];
  return {
    getRecords: () => records,
    findByEventId: vi.fn(async (eventId) => records.filter((d) => d.eventId === eventId)),
    findSettledByEventId: vi.fn(async (eventId) =>
      records.filter((d) => d.eventId === eventId && d.status === "settled"),
    ),
    replacePendingForEvent: vi.fn(async (eventId, debts) => {
      records = records.filter((d) => !(d.eventId === eventId && d.status === "pending"));
      records.push(
        ...debts.map((d, index) => ({
          id: `debt-pending-${index}`,
          eventId,
          amountCents: d.amountCents,
          status: "pending" as const,
          settledAt: null,
          createdAt: new Date("2026-09-22T00:00:00.000Z"),
          debtor: { id: d.debtorParticipantId, username: d.debtorParticipantId },
          creditor: { id: d.creditorParticipantId, username: d.creditorParticipantId },
        })),
      );
    }),
  };
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    groupId: "group-1",
    organizerId: "user-organizer",
    name: "Asado",
    location: "Casa de Ana",
    status: "active",
    startDateTime: null,
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    participants: [
      {
        id: "participant-ana",
        eventId: "event-1",
        userId: "user-ana",
        username: "ana",
        isAnonymous: false,
        isOrganizer: true,
      },
      {
        id: "participant-anonymous",
        eventId: "event-1",
        userId: null,
        username: "invitado",
        isAnonymous: true,
        isOrganizer: false,
      },
    ],
    ...overrides,
  };
}

function createFakeEventRepository(event: Event | null): EventRepository {
  return {
    findById: vi.fn(async () => event),
    createAtomic: vi.fn(),
    cancelAtomic: vi.fn(),
    confirmSchedule: vi.fn(),
  };
}

function createDebtService(
  expenseRepository: ExpenseRepository,
  debtRepository: DebtRepository,
  event: Event | null = makeEvent(),
) {
  return createProductionDebtService(
    expenseRepository,
    debtRepository,
    createFakeEventRepository(event),
  );
}

describe("buildParticipantAmounts", () => {
  it("devuelve una lista vacía cuando no hay gastos ni deudas saldadas", () => {
    const result = buildParticipantAmounts([], []);
    expect(result).toEqual([]);
  });

  it("acumula correctamente los montos aportados y adeudados de múltiples gastos", () => {
    const expenses = [
      makeExpense(
        "exp-1",
        "event-1",
        [{ participantId: "ana", amountCents: 6000 }],
        [
          { participantId: "ana", amountCents: 2000 },
          { participantId: "beto", amountCents: 2000 },
          { participantId: "cami", amountCents: 2000 },
        ],
      ),
      makeExpense(
        "exp-2",
        "event-1",
        [{ participantId: "beto", amountCents: 3000 }],
        [
          { participantId: "ana", amountCents: 1500 },
          { participantId: "beto", amountCents: 1500 },
        ],
      ),
    ];

    const result = buildParticipantAmounts(expenses, []);

    expect(result).toEqual(
      expect.arrayContaining([
        { participantId: "ana", contributedCents: 6000, owedCents: 3500 },
        { participantId: "beto", contributedCents: 3000, owedCents: 3500 },
        { participantId: "cami", contributedCents: 0, owedCents: 2000 },
      ]),
    );
  });

  it("trata las deudas saldadas como pagos hechos sumando a aportado del deudor y adeudado del acreedor", () => {
    const expenses = [
      makeExpense(
        "exp-1",
        "event-1",
        [{ participantId: "ana", amountCents: 2000 }],
        [
          { participantId: "ana", amountCents: 1000 },
          { participantId: "beto", amountCents: 1000 },
        ],
      ),
    ];
    const settledDebts = [makeSettledDebt("debt-1", "event-1", "beto", "ana", 1000)];

    const result = buildParticipantAmounts(expenses, settledDebts);

    expect(result).toEqual(
      expect.arrayContaining([
        { participantId: "ana", contributedCents: 2000, owedCents: 2000 },
        { participantId: "beto", contributedCents: 1000, owedCents: 1000 },
      ]),
    );
  });
});

describe("DebtService.recalculateForEvent", () => {
  const eventId = "event-1";

  it("recalcula y guarda las deudas simplificadas para un evento con múltiples gastos", async () => {
    const expenses = [
      makeExpense(
        "exp-1",
        eventId,
        [{ participantId: "ana", amountCents: 3000 }],
        [
          { participantId: "ana", amountCents: 1000 },
          { participantId: "beto", amountCents: 1000 },
          { participantId: "cami", amountCents: 1000 },
        ],
      ),
    ];

    const expenseRepository = createFakeExpenseRepository(expenses);
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(expenseRepository, debtRepository);

    await service.recalculateForEvent(eventId);

    expect(debtRepository.replacePendingForEvent).toHaveBeenCalledWith(eventId, [
      { debtorParticipantId: "beto", creditorParticipantId: "ana", amountCents: 1000 },
      { debtorParticipantId: "cami", creditorParticipantId: "ana", amountCents: 1000 },
    ]);

    const pendingRecords = debtRepository.getRecords().filter((d) => d.status === "pending");
    expect(pendingRecords).toHaveLength(2);
  });

  it("deja sin deudas pendientes a un evento sin gastos", async () => {
    const expenseRepository = createFakeExpenseRepository([]);
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(expenseRepository, debtRepository);

    await service.recalculateForEvent(eventId);

    expect(debtRepository.replacePendingForEvent).toHaveBeenCalledWith(eventId, []);
    expect(debtRepository.getRecords()).toEqual([]);
  });

  it("es idempotente ante dos recálculos consecutivos sin cambios", async () => {
    const expenses = [
      makeExpense(
        "exp-1",
        eventId,
        [{ participantId: "ana", amountCents: 2000 }],
        [
          { participantId: "ana", amountCents: 1000 },
          { participantId: "beto", amountCents: 1000 },
        ],
      ),
    ];

    const expenseRepository = createFakeExpenseRepository(expenses);
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(expenseRepository, debtRepository);

    await service.recalculateForEvent(eventId);
    const firstRunRecords = [...debtRepository.getRecords()];

    await service.recalculateForEvent(eventId);
    const secondRunRecords = [...debtRepository.getRecords()];

    expect(secondRunRecords).toEqual(firstRunRecords);
  });

  it("agrega saldos cuando un participante es acreedor en un gasto y deudor en otro", async () => {
    const expenses = [
      makeExpense(
        "exp-1",
        eventId,
        [{ participantId: "ana", amountCents: 3000 }],
        [
          { participantId: "ana", amountCents: 1000 },
          { participantId: "beto", amountCents: 1000 },
          { participantId: "cami", amountCents: 1000 },
        ],
      ),
      makeExpense(
        "exp-2",
        eventId,
        [{ participantId: "beto", amountCents: 3000 }],
        [
          { participantId: "ana", amountCents: 1000 },
          { participantId: "beto", amountCents: 1000 },
          { participantId: "cami", amountCents: 1000 },
        ],
      ),
    ];

    const expenseRepository = createFakeExpenseRepository(expenses);
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(expenseRepository, debtRepository);

    await service.recalculateForEvent(eventId);

    // Ana puso 3000, debe 2000 -> net +1000
    // Beto puso 3000, debe 2000 -> net +1000
    // Cami puso 0, debe 2000 -> net -2000
    // Cami le debe 1000 a Ana y 1000 a Beto
    expect(debtRepository.replacePendingForEvent).toHaveBeenCalledWith(eventId, [
      { debtorParticipantId: "cami", creditorParticipantId: "ana", amountCents: 1000 },
      { debtorParticipantId: "cami", creditorParticipantId: "beto", amountCents: 1000 },
    ]);
  });

  it("conserva la deuda saldada y solo genera pendientes sobre los nuevos gastos", async () => {
    // Escenario:
    // Gasto 1: Ana puso 2000, dividido entre Ana (1000) y Beto (1000). Beto le debía 1000 a Ana.
    // Deuda saldada: Beto saldó los 1000 con Ana.
    // Gasto 2: Cami pone 3000, dividido entre Ana (1000), Beto (1000) y Cami (1000).
    const settledDebt = makeSettledDebt("debt-settled-1", eventId, "beto", "ana", 1000);
    const expenses = [
      makeExpense(
        "exp-1",
        eventId,
        [{ participantId: "ana", amountCents: 2000 }],
        [
          { participantId: "ana", amountCents: 1000 },
          { participantId: "beto", amountCents: 1000 },
        ],
      ),
      makeExpense(
        "exp-2",
        eventId,
        [{ participantId: "cami", amountCents: 3000 }],
        [
          { participantId: "ana", amountCents: 1000 },
          { participantId: "beto", amountCents: 1000 },
          { participantId: "cami", amountCents: 1000 },
        ],
      ),
    ];

    const expenseRepository = createFakeExpenseRepository(expenses);
    const debtRepository = createFakeDebtRepository([settledDebt]);
    const service = createDebtService(expenseRepository, debtRepository);

    await service.recalculateForEvent(eventId);

    // Net balances:
    // Ana: puso 2000 (exp1), debe 1000 (exp1) + 1000 (settled) + 1000 (exp2) = 3000. Net = -1000
    // Beto: puso 1000 (settled), debe 1000 (exp1) + 1000 (exp2) = 2000. Net = -1000
    // Cami: puso 3000 (exp2), debe 1000 (exp2) = 1000. Net = +2000
    // Nuevas pendientes esperadas: Ana le debe 1000 a Cami, Beto le debe 1000 a Cami.
    expect(debtRepository.replacePendingForEvent).toHaveBeenCalledWith(eventId, [
      { debtorParticipantId: "ana", creditorParticipantId: "cami", amountCents: 1000 },
      { debtorParticipantId: "beto", creditorParticipantId: "cami", amountCents: 1000 },
    ]);

    // La deuda saldada sigue existiendo en el repositorio
    const allRecords = debtRepository.getRecords();
    expect(allRecords.find((d) => d.id === "debt-settled-1")).toBeDefined();
    expect(allRecords.filter((d) => d.status === "pending")).toHaveLength(2);
  });

  it("no genera deudas pendientes cuando todo está saldado y no hay gastos nuevos", async () => {
    const expenses = [
      makeExpense(
        "exp-1",
        eventId,
        [{ participantId: "ana", amountCents: 2000 }],
        [
          { participantId: "ana", amountCents: 1000 },
          { participantId: "beto", amountCents: 1000 },
        ],
      ),
    ];
    const settledDebt = makeSettledDebt("debt-settled-1", eventId, "beto", "ana", 1000);

    const expenseRepository = createFakeExpenseRepository(expenses);
    const debtRepository = createFakeDebtRepository([settledDebt]);
    const service = createDebtService(expenseRepository, debtRepository);

    await service.recalculateForEvent(eventId);

    expect(debtRepository.replacePendingForEvent).toHaveBeenCalledWith(eventId, []);
    const allRecords = debtRepository.getRecords();
    expect(allRecords).toHaveLength(1);
    expect(allRecords[0]?.status).toBe("settled");
  });

  it("propaga el error si la suma de los balances netos no da cero", async () => {
    // Forzamos datos inconsistentes donde los aportes no coinciden con las deudas
    const corruptedExpense: Expense = {
      id: "exp-corrupted",
      eventId,
      description: "Corrupto",
      totalAmountCents: 2000,
      createdByParticipantId: "ana",
      createdAt: new Date(),
      payers: [{ expenseId: "exp-corrupted", participantId: "ana", amountCents: 2000 }],
      debtors: [{ expenseId: "exp-corrupted", participantId: "beto", amountCents: 1500 }], // falta 500
    };

    const expenseRepository = createFakeExpenseRepository([corruptedExpense]);
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(expenseRepository, debtRepository);

    await expect(service.recalculateForEvent(eventId)).rejects.toThrow(
      "La suma de los balances netos debe ser cero",
    );

    expect(debtRepository.replacePendingForEvent).not.toHaveBeenCalled();
  });
});

describe("DebtService.listEventDebts", () => {
  const eventId = "event-1";

  it("devuelve todas las deudas ordenadas para un participante registrado", async () => {
    const settledDebt = makeSettledDebt("debt-settled", eventId, "participant-ana", "beto", 500);
    const pendingDebt: SimplifiedDebtRecord = {
      ...settledDebt,
      id: "debt-pending",
      status: "pending",
      settledAt: null,
    };
    const debtRepository = createFakeDebtRepository([pendingDebt, settledDebt]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.listEventDebts(eventId, { type: "user", userId: "user-ana" }),
    ).resolves.toEqual({ debts: [pendingDebt, settledDebt], allSettled: false });
  });

  it("devuelve allSettled false cuando el evento no tiene deudas", async () => {
    const service = createDebtService(createFakeExpenseRepository(), createFakeDebtRepository());

    await expect(
      service.listEventDebts(eventId, { type: "user", userId: "user-ana" }),
    ).resolves.toEqual({ debts: [], allSettled: false });
  });

  it("devuelve allSettled true solo si todas las deudas están saldadas", async () => {
    const debtRepository = createFakeDebtRepository([
      makeSettledDebt("debt-1", eventId, "participant-ana", "beto", 500),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.listEventDebts(eventId, { type: "user", userId: "user-ana" }),
    ).resolves.toMatchObject({ allSettled: true });
  });

  it("permite consultar a un participante anónimo del mismo evento", async () => {
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.listEventDebts(eventId, {
        type: "anonymousParticipant",
        participantId: "participant-anonymous",
        eventId,
      }),
    ).resolves.toEqual({ debts: [], allSettled: false });
  });

  it("prohíbe a un actor que no pertenece al evento", async () => {
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.listEventDebts(eventId, { type: "user", userId: "user-outsider" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(debtRepository.findByEventId).not.toHaveBeenCalled();
  });

  it("devuelve not found si el evento no existe", async () => {
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(createFakeExpenseRepository(), debtRepository, null);

    await expect(
      service.listEventDebts(eventId, { type: "user", userId: "user-ana" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(debtRepository.findByEventId).not.toHaveBeenCalled();
  });
});
