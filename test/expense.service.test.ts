import { describe, expect, it, vi } from "vitest";
import type {
  CreateExpenseParams,
  Expense,
  ExpenseRepository,
} from "../src/repositories/expense.repository.js";
import type { Event, EventRepository } from "../src/repositories/event.repository.js";
import type {
  AttendanceParticipant,
  Participant,
  ParticipantRepository,
} from "../src/repositories/participant.repository.js";
import { createExpenseService } from "../src/services/expense.service.js";
import {
  EventUnavailableError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../src/shared/errors/index.js";
import type { CreateExpenseDTO } from "../src/validators/expense/create.expense.validator.js";

const eventId = "event-1";

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "participant-creator",
    eventId,
    username: "ana",
    isAnonymous: false,
    ...overrides,
  };
}

function makeAttendanceParticipant(
  overrides: Partial<AttendanceParticipant> = {},
): AttendanceParticipant {
  return {
    id: "participant-creator",
    eventId,
    userId: "user-1",
    username: "ana",
    isAnonymous: false,
    isOrganizer: false,
    attendanceState: "not_confirmed",
    ...overrides,
  };
}

function makeExpense(params: CreateExpenseParams): Expense {
  return {
    id: "expense-1",
    ...params,
    createdAt: new Date("2026-09-19T00:00:00.000Z"),
    payers: params.payers.map((payer) => ({ ...payer, expenseId: "expense-1" })),
    debtors: params.debtors.map((debtor) => ({ ...debtor, expenseId: "expense-1" })),
  };
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: eventId,
    groupId: "group-1",
    organizerId: "user-1",
    name: "Cena",
    location: "Casa de Ana",
    status: "active",
    startDateTime: null,
    createdAt: new Date("2026-09-19T00:00:00.000Z"),
    updatedAt: new Date("2026-09-19T00:00:00.000Z"),
    participants: [],
    ...overrides,
  };
}

function createParticipantRepository(
  participants: Participant[],
  creator: AttendanceParticipant | null = makeAttendanceParticipant(),
): ParticipantRepository {
  return {
    findById: vi.fn(
      async (id) => participants.find((participant) => participant.id === id) ?? null,
    ),
    findByEventId: vi.fn(async () => participants),
    findByEventIdAndUsername: vi.fn(),
    findAttendanceById: vi.fn(),
    findAttendanceByEventIdAndUserId: vi.fn(async () => creator),
    createAnonymous: vi.fn(),
    updateAttendance: vi.fn(),
  };
}

function createExpenseRepository(): ExpenseRepository {
  return {
    createAtomic: vi.fn(async (params) => makeExpense(params)),
  };
}

function createEventRepository(event: Event | null = makeEvent()): EventRepository {
  return {
    findById: vi.fn(async () => event),
    createAtomic: vi.fn(),
    cancelAtomic: vi.fn(),
    confirmSchedule: vi.fn(),
  };
}

function makeDto(overrides: Partial<CreateExpenseDTO> = {}): CreateExpenseDTO {
  return {
    description: "Cena",
    totalAmountCents: 4500,
    payers: [
      { participantId: "participant-creator", amountCents: 3000 },
      { participantId: "participant-beto", amountCents: 1500 },
    ],
    debtors: [
      { participantId: "participant-creator", amountCents: 1500 },
      { participantId: "participant-beto", amountCents: 1500 },
      { participantId: "participant-cami", amountCents: 1500 },
    ],
    ...overrides,
  };
}

function makeService(
  participants: Participant[] = [
    makeParticipant(),
    makeParticipant({ id: "participant-beto", username: "beto" }),
    makeParticipant({ id: "participant-cami", username: "cami" }),
  ],
  creator: AttendanceParticipant | null = makeAttendanceParticipant(),
  event: Event | null = makeEvent(),
) {
  const expenseRepository = createExpenseRepository();
  const eventRepository = createEventRepository(event);
  const participantRepository = createParticipantRepository(participants, creator);
  const service = createExpenseService(expenseRepository, eventRepository, participantRepository);

  return { service, expenseRepository, eventRepository, participantRepository };
}

describe("ExpenseService.createExpense", () => {
  it("crea un gasto con múltiples acreedores y deudores", async () => {
    const { service, expenseRepository } = makeService();
    const dto = makeDto();

    await expect(
      service.createExpense(eventId, { type: "user", userId: "user-1" }, dto),
    ).resolves.toMatchObject({
      id: "expense-1",
      totalAmountCents: 4500,
      payers: dto.payers,
      debtors: dto.debtors,
    });

    expect(expenseRepository.createAtomic).toHaveBeenCalledWith({
      eventId,
      description: dto.description,
      totalAmountCents: dto.totalAmountCents,
      createdByParticipantId: "participant-creator",
      payers: dto.payers,
      debtors: dto.debtors,
    });
  });

  it("acepta al participante anónimo del mismo evento como creador", async () => {
    const anonymousCreator = makeParticipant({
      id: "participant-anonymous",
      username: "invitado",
      isAnonymous: true,
    });
    const { service, expenseRepository } = makeService([
      anonymousCreator,
      makeParticipant({ id: "participant-beto", username: "beto" }),
      makeParticipant({ id: "participant-cami", username: "cami" }),
    ]);
    const dto = makeDto({
      payers: [
        { participantId: "participant-anonymous", amountCents: 3000 },
        { participantId: "participant-beto", amountCents: 1500 },
      ],
      debtors: [
        { participantId: "participant-anonymous", amountCents: 1500 },
        { participantId: "participant-beto", amountCents: 1500 },
        { participantId: "participant-cami", amountCents: 1500 },
      ],
    });

    await service.createExpense(
      eventId,
      {
        type: "anonymousParticipant",
        participantId: anonymousCreator.id,
        eventId,
      },
      dto,
    );

    expect(expenseRepository.createAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ createdByParticipantId: anonymousCreator.id }),
    );
  });

  it("permite gastos en un evento confirmado", async () => {
    const { service, expenseRepository } = makeService(
      undefined,
      undefined,
      makeEvent({ status: "confirmed" }),
    );

    await expect(
      service.createExpense(eventId, { type: "user", userId: "user-1" }, makeDto()),
    ).resolves.toMatchObject({ id: "expense-1" });

    expect(expenseRepository.createAtomic).toHaveBeenCalledOnce();
  });

  it("devuelve not found si el evento no existe", async () => {
    const { service, expenseRepository, participantRepository } = makeService(
      undefined,
      undefined,
      null,
    );

    await expect(
      service.createExpense(eventId, { type: "user", userId: "user-1" }, makeDto()),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(participantRepository.findByEventId).not.toHaveBeenCalled();
    expect(expenseRepository.createAtomic).not.toHaveBeenCalled();
  });

  it("rechaza gastos para un evento cancelado", async () => {
    const { service, expenseRepository, participantRepository } = makeService(
      undefined,
      undefined,
      makeEvent({ status: "cancelled" }),
    );

    await expect(
      service.createExpense(eventId, { type: "user", userId: "user-1" }, makeDto()),
    ).rejects.toBeInstanceOf(EventUnavailableError);

    expect(participantRepository.findByEventId).not.toHaveBeenCalled();
    expect(expenseRepository.createAtomic).not.toHaveBeenCalled();
  });

  it.each([
    ["la suma de acreedores no coincide", makeDto({ totalAmountCents: 4000 })],
    [
      "la suma de deudores no coincide",
      makeDto({
        debtors: [
          { participantId: "participant-creator", amountCents: 1000 },
          { participantId: "participant-beto", amountCents: 1500 },
          { participantId: "participant-cami", amountCents: 1500 },
        ],
      }),
    ],
    [
      "hay acreedores repetidos",
      makeDto({
        payers: [
          { participantId: "participant-creator", amountCents: 3000 },
          { participantId: "participant-creator", amountCents: 1500 },
        ],
      }),
    ],
    [
      "hay deudores repetidos",
      makeDto({
        debtors: [
          { participantId: "participant-creator", amountCents: 1500 },
          { participantId: "participant-beto", amountCents: 1500 },
          { participantId: "participant-beto", amountCents: 1500 },
        ],
      }),
    ],
  ])("rechaza cuando %s", async (_description, dto) => {
    const { service, expenseRepository } = makeService();

    await expect(
      service.createExpense(eventId, { type: "user", userId: "user-1" }, dto),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(expenseRepository.createAtomic).not.toHaveBeenCalled();
  });

  it("rechaza acreedores o deudores que no pertenecen al evento", async () => {
    const { service, expenseRepository } = makeService();
    const dto = makeDto({
      payers: [
        { participantId: "participant-creator", amountCents: 3000 },
        { participantId: "participant-outside", amountCents: 1500 },
      ],
    });

    await expect(
      service.createExpense(eventId, { type: "user", userId: "user-1" }, dto),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(expenseRepository.createAtomic).not.toHaveBeenCalled();
  });

  it("prohibe a un usuario que no es participante del evento", async () => {
    const { service, expenseRepository } = makeService(undefined, null);

    await expect(
      service.createExpense(eventId, { type: "user", userId: "user-outside" }, makeDto()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(expenseRepository.createAtomic).not.toHaveBeenCalled();
  });

  it("rechaza a un participante anónimo cuyo token corresponde a otro evento", async () => {
    const anonymousParticipant = makeParticipant({
      id: "participant-anonymous",
      eventId: "event-2",
      isAnonymous: true,
    });
    const { service, expenseRepository, participantRepository } = makeService([
      anonymousParticipant,
    ]);

    await expect(
      service.createExpense(
        eventId,
        {
          type: "anonymousParticipant",
          participantId: anonymousParticipant.id,
          eventId: "event-2",
        },
        makeDto(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(participantRepository.findByEventId).not.toHaveBeenCalled();
    expect(expenseRepository.createAtomic).not.toHaveBeenCalled();
  });

  it.each([
    ["no existe", "participant-missing", []],
    ["no es anonimo", "participant-creator", [makeParticipant()]],
  ])(
    "prohibe un actor anonimo cuyo participante %s",
    async (_description, participantId, participants) => {
      const { service, expenseRepository, participantRepository } = makeService(participants);

      await expect(
        service.createExpense(
          eventId,
          { type: "anonymousParticipant", participantId, eventId },
          makeDto(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(participantRepository.findByEventId).not.toHaveBeenCalled();
      expect(expenseRepository.createAtomic).not.toHaveBeenCalled();
    },
  );
});
