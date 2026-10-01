import { describe, expect, it, vi } from "vitest";
import type { Expense, ExpenseRepository } from "../src/repositories/expense.repository.js";
import type {
  DebtForUserRecord,
  DebtRepository,
  SimplifiedDebtRecord,
} from "../src/repositories/debt.repository.js";
import type { SimplifiedDebt } from "../src/services/debt-simplification.service.js";
import {
  buildParticipantAmounts,
  isPersonKey,
  toPersonKey,
  createDebtService as createDebtServiceImplementation,
} from "../src/services/debt.service.js";
import {
  DebtAlreadySettledError,
  EventUnavailableError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../src/shared/errors/index.js";
import type { Event, EventRepository } from "../src/repositories/event.repository.js";

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

function makePendingDebt(
  id: string,
  eventId: string,
  debtorParticipantId: string,
  creditorParticipantId: string,
  amountCents: number,
): SimplifiedDebtRecord {
  return {
    ...makeSettledDebt(id, eventId, debtorParticipantId, creditorParticipantId, amountCents),
    status: "pending",
    settledAt: null,
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
    findById: vi.fn(async (debtId) => records.find((debt) => debt.id === debtId) ?? null),
    findByEventId: vi.fn(async (eventId) => records.filter((d) => d.eventId === eventId)),
    findSettledByEventId: vi.fn(async (eventId) =>
      records.filter((d) => d.eventId === eventId && d.status === "settled"),
    ),
    findByUserId: vi.fn(async () => []),
    markSettled: vi.fn(async (debtId, settledAt) => {
      const debtIndex = records.findIndex(
        (debt) => debt.id === debtId && debt.status === "pending",
      );

      if (debtIndex === -1) {
        return 0;
      }

      const debt = records[debtIndex]!;
      records[debtIndex] = { ...debt, status: "settled", settledAt };
      return 1;
    }),
    replacePendingForEvent: vi.fn(async (eventId, debts) => {
      records = records.filter((d) => !(d.eventId === eventId && d.status === "pending"));
      records.push(
        ...debts.map((debt: SimplifiedDebt, index: number) => ({
          id: `debt-pending-${index}`,
          eventId,
          amountCents: debt.amountCents,
          status: "pending" as const,
          settledAt: null,
          createdAt: new Date("2026-09-22T00:00:00.000Z"),
          debtor: { id: debt.debtorParticipantId, username: debt.debtorParticipantId },
          creditor: { id: debt.creditorParticipantId, username: debt.creditorParticipantId },
        })),
      );
    }),
  };
}

function makeDebtForUser(overrides: Partial<DebtForUserRecord> = {}): DebtForUserRecord {
  return {
    debtor: {
      participantId: "participant-debtor",
      userId: "user-debtor",
      participantUsername: "debtor",
      userName: "Debtor",
    },
    creditor: {
      participantId: "participant-creditor",
      userId: "user-creditor",
      participantUsername: "creditor",
      userName: "Creditor",
    },
    amountCents: 1000,
    status: "pending",
    eventId: "event-1",
    eventName: "Evento",
    ...overrides,
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
    expensesClosed: false,
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
        id: "participant-beto",
        eventId: "event-1",
        userId: "user-beto",
        username: "beto",
        isAnonymous: false,
        isOrganizer: false,
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
    closeExpenses: vi.fn(),
    confirmSchedule: vi.fn(),
  };
}

function createDebtService(
  expenseRepository: ExpenseRepository,
  debtRepository: DebtRepository,
  event: Event | null = makeEvent(),
) {
  return createDebtServiceImplementation(
    expenseRepository,
    debtRepository,
    createFakeEventRepository(event),
  );
}

describe("personKey", () => {
  it("identifica a una contraparte registrada por su userId", () => {
    expect(toPersonKey({ participantId: "participant-marcos-asado", userId: "user-marcos" })).toBe(
      "user:user-marcos",
    );
  });

  it("identifica a una contraparte anónima por su participantId", () => {
    expect(toPersonKey({ participantId: "participant-invitado", userId: null })).toBe(
      "participant:participant-invitado",
    );
  });

  it.each(["user:user-marcos", "participant:participant-invitado"])(
    "acepta la clave válida %s",
    (personKey) => {
      expect(isPersonKey(personKey)).toBe(true);
    },
  );

  it.each(["user:", "participant:", "person:user-marcos", "user:user:marcos", ""])(
    "rechaza la clave inválida %s",
    (personKey) => {
      expect(isPersonKey(personKey)).toBe(false);
    },
  );
});

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

describe("DebtService.getBalanceSummary", () => {
  const userId = "user-ana";

  it("acumula créditos y deudas pendientes de distintos eventos sin compensarlos", async () => {
    const debtRepository = createFakeDebtRepository();
    vi.mocked(debtRepository.findByUserId).mockResolvedValue([
      makeDebtForUser({
        eventId: "event-asado",
        amountCents: 5000,
        debtor: {
          participantId: "participant-beto-asado",
          userId: "user-beto",
          participantUsername: "beto",
          userName: "Beto",
        },
        creditor: {
          participantId: "participant-ana-asado",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
      }),
      makeDebtForUser({
        eventId: "event-cine",
        amountCents: 2300,
        debtor: {
          participantId: "participant-ana-cine",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
        creditor: {
          participantId: "participant-cami-cine",
          userId: "user-cami",
          participantUsername: "cami",
          userName: "Cami",
        },
      }),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(service.getBalanceSummary(userId)).resolves.toEqual({
      owedToMeCents: 5000,
      iOweCents: 2300,
    });
    expect(debtRepository.findByUserId).toHaveBeenCalledWith(userId, { statuses: ["pending"] });
  });

  it("no suma deudas settled aunque sean devueltas por el repositorio", async () => {
    const debtRepository = createFakeDebtRepository();
    vi.mocked(debtRepository.findByUserId).mockResolvedValue([
      makeDebtForUser({
        amountCents: 5000,
        status: "settled",
        creditor: {
          participantId: "participant-ana",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
      }),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(service.getBalanceSummary(userId)).resolves.toEqual({
      owedToMeCents: 0,
      iOweCents: 0,
    });
  });

  it("devuelve ceros cuando el usuario no tiene deudas", async () => {
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(service.getBalanceSummary(userId)).resolves.toEqual({
      owedToMeCents: 0,
      iOweCents: 0,
    });
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

describe("DebtService.getPeopleBalances", () => {
  const userId = "user-ana";

  it("compensa deudas opuestas con la misma persona entre eventos", async () => {
    const debtRepository = createFakeDebtRepository();
    vi.mocked(debtRepository.findByUserId).mockResolvedValue([
      makeDebtForUser({
        eventId: "event-asado",
        eventName: "Asado",
        amountCents: 500,
        debtor: {
          participantId: "participant-ana-asado",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
        creditor: {
          participantId: "participant-marcos-asado",
          userId: "user-marcos",
          participantUsername: "marcos",
          userName: "Marcos",
        },
      }),
      makeDebtForUser({
        eventId: "event-cine",
        eventName: "Cine",
        amountCents: 300,
        debtor: {
          participantId: "participant-marcos-cine",
          userId: "user-marcos",
          participantUsername: "marcos",
          userName: "Marcos",
        },
        creditor: {
          participantId: "participant-ana-cine",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
      }),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(service.getPeopleBalances(userId)).resolves.toEqual([
      {
        personKey: "user:user-marcos",
        displayName: "Marcos",
        status: "pay",
        netCents: -200,
      },
    ]);
    expect(debtRepository.findByUserId).toHaveBeenCalledWith(userId, {
      statuses: ["pending", "settled"],
    });
  });

  it("conserva una relación saldada aunque no tenga pendientes", async () => {
    const debtRepository = createFakeDebtRepository();
    vi.mocked(debtRepository.findByUserId).mockResolvedValue([
      makeDebtForUser({
        status: "settled",
        debtor: {
          participantId: "participant-ana",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
        creditor: {
          participantId: "participant-marcos",
          userId: "user-marcos",
          participantUsername: "marcos",
          userName: "Marcos",
        },
      }),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(service.getPeopleBalances(userId)).resolves.toEqual([
      {
        personKey: "user:user-marcos",
        displayName: "Marcos",
        status: "settled",
        netCents: 0,
      },
    ]);
  });

  it("no compensa participantes anónimos entre eventos", async () => {
    const debtRepository = createFakeDebtRepository();
    vi.mocked(debtRepository.findByUserId).mockResolvedValue([
      makeDebtForUser({
        eventId: "event-asado",
        amountCents: 500,
        debtor: {
          participantId: "participant-ana-asado",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
        creditor: {
          participantId: "participant-invitado-asado",
          userId: null,
          participantUsername: "Invitado",
          userName: null,
        },
      }),
      makeDebtForUser({
        eventId: "event-cine",
        amountCents: 300,
        debtor: {
          participantId: "participant-invitado-cine",
          userId: null,
          participantUsername: "Invitado",
          userName: null,
        },
        creditor: {
          participantId: "participant-ana-cine",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
      }),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(service.getPeopleBalances(userId)).resolves.toEqual([
      {
        personKey: "participant:participant-invitado-asado",
        displayName: "Invitado",
        status: "pay",
        netCents: -500,
      },
      {
        personKey: "participant:participant-invitado-cine",
        displayName: "Invitado",
        status: "pending",
        netCents: 300,
      },
    ]);
  });
});

describe("DebtService.getPersonDetail", () => {
  const userId = "user-ana";

  it("devuelve las deudas pendientes por evento y el neto compensado", async () => {
    const debtRepository = createFakeDebtRepository();
    vi.mocked(debtRepository.findByUserId).mockResolvedValue([
      makeDebtForUser({
        eventId: "event-asado",
        eventName: "Asado",
        amountCents: 500,
        debtor: {
          participantId: "participant-ana-asado",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
        creditor: {
          participantId: "participant-marcos-asado",
          userId: "user-marcos",
          participantUsername: "marcos",
          userName: "Marcos",
        },
      }),
      makeDebtForUser({
        eventId: "event-cine",
        eventName: "Cine",
        amountCents: 300,
        debtor: {
          participantId: "participant-marcos-cine",
          userId: "user-marcos",
          participantUsername: "marcos",
          userName: "Marcos",
        },
        creditor: {
          participantId: "participant-ana-cine",
          userId,
          participantUsername: "ana",
          userName: "Ana",
        },
      }),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(service.getPersonDetail(userId, "user:user-marcos")).resolves.toEqual({
      personKey: "user:user-marcos",
      displayName: "Marcos",
      status: "pay",
      netCents: -200,
      breakdown: [
        {
          eventId: "event-asado",
          eventName: "Asado",
          amountCents: 500,
          direction: "i_owe",
        },
        {
          eventId: "event-cine",
          eventName: "Cine",
          amountCents: 300,
          direction: "owed_to_me",
        },
      ],
    });
  });

  it("rechaza una personKey inválida antes de consultar deudas", async () => {
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(service.getPersonDetail(userId, "marcos")).rejects.toBeInstanceOf(ValidationError);
    expect(debtRepository.findByUserId).not.toHaveBeenCalled();
  });

  it("informa cuando la persona no tiene relación con el usuario", async () => {
    const debtRepository = createFakeDebtRepository();
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(service.getPersonDetail(userId, "user:user-inexistente")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("DebtService.settleDebt", () => {
  const eventId = "event-1";
  const debtId = "debt-1";

  it("permite al deudor saldar una deuda pendiente sin recalcular", async () => {
    const debt = makePendingDebt(debtId, eventId, "participant-ana", "participant-beto", 1500);
    const expenseRepository = createFakeExpenseRepository();
    const debtRepository = createFakeDebtRepository([debt]);
    const service = createDebtService(expenseRepository, debtRepository);

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-ana" }),
    ).resolves.toEqual({
      debt: expect.objectContaining({
        ...debt,
        status: "settled",
        settledAt: expect.any(Date),
      }),
      allEventDebtsSettled: true,
    });

    expect(debtRepository.getRecords()[0]).toMatchObject({
      status: "settled",
      settledAt: expect.any(Date),
    });
    expect(expenseRepository.findByEventId).not.toHaveBeenCalled();
    expect(debtRepository.replacePendingForEvent).not.toHaveBeenCalled();
  });

  it("permite al acreedor saldar una deuda pendiente", async () => {
    const debtRepository = createFakeDebtRepository([
      makePendingDebt(debtId, eventId, "participant-ana", "participant-beto", 1500),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-beto" }),
    ).resolves.toMatchObject({
      debt: { status: "settled" },
      allEventDebtsSettled: true,
    });
  });

  it("permite al deudor anónimo saldar una deuda pendiente", async () => {
    const debtRepository = createFakeDebtRepository([
      makePendingDebt(debtId, eventId, "participant-anonymous", "participant-beto", 1500),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.settleDebt(eventId, debtId, {
        type: "anonymousParticipant",
        participantId: "participant-anonymous",
        eventId,
      }),
    ).resolves.toMatchObject({
      debt: { status: "settled" },
      allEventDebtsSettled: true,
    });
  });

  it("informa false cuando quedan otras deudas pendientes", async () => {
    const debtRepository = createFakeDebtRepository([
      makePendingDebt(debtId, eventId, "participant-ana", "participant-beto", 1500),
      makePendingDebt("debt-2", eventId, "participant-beto", "participant-anonymous", 500),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-ana" }),
    ).resolves.toMatchObject({ allEventDebtsSettled: false });
  });

  it("rechaza una deuda que ya fue saldada", async () => {
    const debtRepository = createFakeDebtRepository([
      makeSettledDebt(debtId, eventId, "participant-ana", "participant-beto", 1500),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-ana" }),
    ).rejects.toBeInstanceOf(DebtAlreadySettledError);
    expect(debtRepository.markSettled).not.toHaveBeenCalled();
  });

  it("rechaza el segundo saldado detectado por la actualización condicional", async () => {
    const debtRepository = createFakeDebtRepository([
      makePendingDebt(debtId, eventId, "participant-ana", "participant-beto", 1500),
    ]);
    vi.mocked(debtRepository.markSettled).mockResolvedValueOnce(0);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-ana" }),
    ).rejects.toBeInstanceOf(DebtAlreadySettledError);
  });

  it("prohíbe a un participante que no es parte de la deuda", async () => {
    const debtRepository = createFakeDebtRepository([
      makePendingDebt(debtId, eventId, "participant-beto", "participant-anonymous", 1500),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-ana" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(debtRepository.markSettled).not.toHaveBeenCalled();
  });

  it("oculta una deuda de otro evento como no encontrada", async () => {
    const debtRepository = createFakeDebtRepository([
      makePendingDebt(debtId, "event-2", "participant-ana", "participant-beto", 1500),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository);

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-ana" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(debtRepository.markSettled).not.toHaveBeenCalled();
  });

  it("rechaza un evento cancelado", async () => {
    const debtRepository = createFakeDebtRepository([
      makePendingDebt(debtId, eventId, "participant-ana", "participant-beto", 1500),
    ]);
    const service = createDebtService(
      createFakeExpenseRepository(),
      debtRepository,
      makeEvent({ status: "cancelled" }),
    );

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-ana" }),
    ).rejects.toBeInstanceOf(EventUnavailableError);
    expect(debtRepository.findById).not.toHaveBeenCalled();
  });

  it("permite saldar en un evento confirmado", async () => {
    const debtRepository = createFakeDebtRepository([
      makePendingDebt(debtId, eventId, "participant-ana", "participant-beto", 1500),
    ]);
    const service = createDebtService(
      createFakeExpenseRepository(),
      debtRepository,
      makeEvent({ status: "confirmed" }),
    );

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-ana" }),
    ).resolves.toMatchObject({ debt: { status: "settled" } });
  });

  it("rechaza cuando el evento no existe", async () => {
    const debtRepository = createFakeDebtRepository([
      makePendingDebt(debtId, eventId, "participant-ana", "participant-beto", 1500),
    ]);
    const service = createDebtService(createFakeExpenseRepository(), debtRepository, null);

    await expect(
      service.settleDebt(eventId, debtId, { type: "user", userId: "user-ana" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(debtRepository.findById).not.toHaveBeenCalled();
  });
});
