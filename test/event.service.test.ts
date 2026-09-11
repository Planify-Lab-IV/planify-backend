import { describe, expect, it, vi } from "vitest";
import { type Event, type EventRepository } from "../src/repositories/event.repository.js";
import type { GroupRepository } from "../src/repositories/group.repository.js";
import type {
  AttendanceParticipant,
  ParticipantRepository,
} from "../src/repositories/participant.repository.js";
import type { UserRepository } from "../src/repositories/user.repository.js";
import { createEventService } from "../src/services/event.service.js";
import {
  EventUnavailableError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../src/shared/errors/index.js";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    groupId: "group-1",
    organizerId: "user-organizer",
    name: "Cumpleaños",
    location: "Casa de Ana",
    status: "active",
    startDateTime: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    participants: [
      {
        id: "participant-organizer",
        eventId: "event-1",
        userId: "user-organizer",
        username: "organizer",
        isAnonymous: false,
        isOrganizer: true,
      },
    ],
    ...overrides,
  };
}

function createInMemoryEventRepository(events: Event[]): EventRepository {
  const records = new Map(events.map((event) => [event.id, event]));

  return {
    findById: vi.fn(async (id) => records.get(id) ?? null),
    createAtomic: vi.fn(),
    cancelAtomic: vi.fn(async (id) => {
      const event = records.get(id);
      if (!event) {
        throw new Error("El evento debe existir antes de cancelarlo");
      }

      const cancelledEvent = { ...event, status: "cancelled" as const };
      records.set(id, cancelledEvent);
      return cancelledEvent;
    }),
    confirmSchedule: vi.fn(async (id, startDateTime) => {
      const event = records.get(id);
      if (!event) {
        throw new Error("El evento debe existir antes de confirmar su horario");
      }

      const confirmedEvent = { ...event, status: "confirmed" as const, startDateTime };
      records.set(id, confirmedEvent);
      return confirmedEvent;
    }),
  };
}

const unusedGroupRepository: GroupRepository = {
  findById: vi.fn(),
  isMember: vi.fn(),
  create: vi.fn(),
  findByUserId: vi.fn(),
};

const unusedUserRepository: UserRepository = {
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findPublicByIdentifier: vi.fn(),
  findByIdentifier: vi.fn(),
  create: vi.fn(),
};

const unusedParticipantRepository: ParticipantRepository = {
  findById: vi.fn(),
  findByEventId: vi.fn(),
  findByEventIdAndUsername: vi.fn(),
  findAttendanceById: vi.fn(),
  findAttendanceByEventIdAndUserId: vi.fn(),
  createAnonymous: vi.fn(),
  updateAttendance: vi.fn(),
  invalidateAnonymousSessions: vi.fn(),
};

describe("EventService.getById", () => {
  function makeService(event: Event | null = makeEvent()) {
    const eventRepository = createInMemoryEventRepository(event ? [event] : []);
    const service = createEventService(
      eventRepository,
      unusedGroupRepository,
      unusedUserRepository,
      unusedParticipantRepository,
    );

    return { service, eventRepository };
  }

  it("permite al organizador registrado obtener el detalle", async () => {
    const event = makeEvent();
    const { service, eventRepository } = makeService(event);

    await expect(
      service.getById(event.id, { type: "user", userId: "user-organizer" }),
    ).resolves.toBe(event);
    expect(eventRepository.findById).toHaveBeenCalledWith(event.id);
  });

  it("permite a un participante registrado obtener el detalle", async () => {
    const event = makeEvent({
      participants: [
        ...makeEvent().participants,
        {
          id: "participant-member",
          eventId: "event-1",
          userId: "user-member",
          username: "member",
          isAnonymous: false,
          isOrganizer: false,
        },
      ],
    });
    const { service } = makeService(event);

    await expect(service.getById(event.id, { type: "user", userId: "user-member" })).resolves.toBe(
      event,
    );
  });

  it("permite a un participante anónimo del evento obtener el detalle", async () => {
    const event = makeEvent({
      participants: [
        {
          id: "participant-anonymous",
          eventId: "event-1",
          userId: null,
          username: "invitado",
          isAnonymous: true,
          isOrganizer: false,
        },
      ],
    });
    const { service } = makeService(event);

    await expect(
      service.getById(event.id, {
        type: "anonymousParticipant",
        participantId: "participant-anonymous",
        eventId: event.id,
      }),
    ).resolves.toBe(event);
  });

  it("devuelve 404 si el evento no existe", async () => {
    const { service } = makeService(null);

    await expect(
      service.getById("event-unknown", { type: "user", userId: "user-organizer" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("devuelve 403 si el usuario registrado no participa", async () => {
    const { service } = makeService();

    await expect(
      service.getById("event-1", { type: "user", userId: "user-outsider" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("devuelve 403 si el token anónimo corresponde a otro evento", async () => {
    const event = makeEvent({
      participants: [
        {
          id: "participant-anonymous",
          eventId: "event-1",
          userId: null,
          username: "invitado",
          isAnonymous: true,
          isOrganizer: false,
        },
      ],
    });
    const { service } = makeService(event);

    await expect(
      service.getById(event.id, {
        type: "anonymousParticipant",
        participantId: "participant-anonymous",
        eventId: "event-2",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("permite a un participante registrado consultar un evento cancelado", async () => {
    const event = makeEvent({ status: "cancelled" });
    const { service } = makeService(event);

    await expect(
      service.getById(event.id, { type: "user", userId: "user-organizer" }),
    ).resolves.toMatchObject({ status: "cancelled" });
  });
});

describe("EventService.cancel", () => {
  it("permite al participante organizador cancelar el evento", async () => {
    const eventRepository = createInMemoryEventRepository([makeEvent()]);
    const service = createEventService(
      eventRepository,
      unusedGroupRepository,
      unusedUserRepository,
      unusedParticipantRepository,
    );

    await expect(service.cancel("user-organizer", "event-1")).resolves.toMatchObject({
      id: "event-1",
      status: "cancelled",
    });

    expect(eventRepository.cancelAtomic).toHaveBeenCalledWith("event-1");
  });

  it("devuelve 404 si el evento no existe", async () => {
    const eventRepository = createInMemoryEventRepository([]);
    const service = createEventService(
      eventRepository,
      unusedGroupRepository,
      unusedUserRepository,
      unusedParticipantRepository,
    );

    await expect(service.cancel("user-organizer", "event-unknown")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(eventRepository.cancelAtomic).not.toHaveBeenCalled();
  });

  it("devuelve 403 si quien llama no es el participante organizador", async () => {
    const eventRepository = createInMemoryEventRepository([
      makeEvent({
        participants: [
          {
            id: "participant-member",
            eventId: "event-1",
            userId: "user-member",
            username: "member",
            isAnonymous: false,
            isOrganizer: false,
          },
        ],
      }),
    ]);
    const service = createEventService(
      eventRepository,
      unusedGroupRepository,
      unusedUserRepository,
      unusedParticipantRepository,
    );

    await expect(service.cancel("user-member", "event-1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(eventRepository.cancelAtomic).not.toHaveBeenCalled();
  });

  it("es idempotente cuando el organizador cancela un evento ya cancelado", async () => {
    const cancelledEvent = makeEvent({ status: "cancelled" });
    const eventRepository = createInMemoryEventRepository([cancelledEvent]);
    const service = createEventService(
      eventRepository,
      unusedGroupRepository,
      unusedUserRepository,
      unusedParticipantRepository,
    );

    await expect(service.cancel("user-organizer", "event-1")).resolves.toBe(cancelledEvent);
    expect(eventRepository.cancelAtomic).not.toHaveBeenCalled();
  });
});

describe("EventService.confirmSchedule", () => {
  function makeService(event: Event | null = makeEvent()) {
    const eventRepository = createInMemoryEventRepository(event ? [event] : []);
    const service = createEventService(
      eventRepository,
      unusedGroupRepository,
      unusedUserRepository,
      unusedParticipantRepository,
    );

    return { service, eventRepository };
  }

  it("confirma un horario futuro elegido por el organizador", async () => {
    const { service, eventRepository } = makeService();
    const startDateTime = new Date("2099-12-31T22:00:00.000Z");

    await expect(
      service.confirmSchedule("user-organizer", "event-1", startDateTime),
    ).resolves.toMatchObject({ status: "confirmed", startDateTime });
    expect(eventRepository.confirmSchedule).toHaveBeenCalledWith("event-1", startDateTime);
  });

  it("devuelve 400 para una fecha inválida sin consultar el evento", async () => {
    const { service, eventRepository } = makeService();

    await expect(
      service.confirmSchedule("user-organizer", "event-1", new Date("invalid")),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(eventRepository.findById).not.toHaveBeenCalled();
    expect(eventRepository.confirmSchedule).not.toHaveBeenCalled();
  });

  it("devuelve 400 para una fecha pasada sin consultar el evento", async () => {
    const { service, eventRepository } = makeService();

    await expect(
      service.confirmSchedule("user-organizer", "event-1", new Date("2000-01-01T00:00:00Z")),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(eventRepository.findById).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el evento no existe", async () => {
    const { service, eventRepository } = makeService(null);

    await expect(
      service.confirmSchedule("user-organizer", "event-unknown", new Date("2099-12-31T22:00:00Z")),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(eventRepository.confirmSchedule).not.toHaveBeenCalled();
  });

  it("devuelve 403 si quien confirma no es el organizador", async () => {
    const { service, eventRepository } = makeService();

    await expect(
      service.confirmSchedule("user-member", "event-1", new Date("2099-12-31T22:00:00Z")),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(eventRepository.confirmSchedule).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el evento está cancelado", async () => {
    const { service, eventRepository } = makeService(makeEvent({ status: "cancelled" }));

    await expect(
      service.confirmSchedule("user-organizer", "event-1", new Date("2099-12-31T22:00:00Z")),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(eventRepository.confirmSchedule).not.toHaveBeenCalled();
  });

  it("permite volver a confirmar un evento para actualizar su horario", async () => {
    const { service } = makeService(
      makeEvent({ status: "confirmed", startDateTime: new Date("2099-01-01T00:00:00Z") }),
    );
    const newStartDateTime = new Date("2099-12-31T22:00:00Z");

    await expect(
      service.confirmSchedule("user-organizer", "event-1", newStartDateTime),
    ).resolves.toMatchObject({ status: "confirmed", startDateTime: newStartDateTime });
  });
});

function makeAttendanceParticipant(
  overrides: Partial<AttendanceParticipant> = {},
): AttendanceParticipant {
  return {
    id: "participant-1",
    eventId: "event-1",
    userId: "user-1",
    username: "Gil",
    isAnonymous: false,
    isOrganizer: false,
    attendanceState: "not_confirmed",
    ...overrides,
  };
}

function createInMemoryParticipantRepository(
  participants: AttendanceParticipant[],
): ParticipantRepository {
  const records = new Map(participants.map((participant) => [participant.id, participant]));

  return {
    findById: vi.fn(),
    findByEventId: vi.fn(),
    findByEventIdAndUsername: vi.fn(),
    findAttendanceById: vi.fn(async (id) => records.get(id) ?? null),
    findAttendanceByEventIdAndUserId: vi.fn(async (eventId, userId) => {
      return (
        [...records.values()].find(
          (participant) => participant.eventId === eventId && participant.userId === userId,
        ) ?? null
      );
    }),
    createAnonymous: vi.fn(),
    updateAttendance: vi.fn(async (id, state) => {
      const participant = records.get(id);
      if (!participant) {
        throw new Error("El participante debe existir antes de actualizarlo");
      }

      const updatedParticipant = { ...participant, attendanceState: state };
      records.set(id, updatedParticipant);
      return updatedParticipant;
    }),
    invalidateAnonymousSessions: vi.fn(),
  };
}

describe("EventService.answerAttendance", () => {
  function makeService(
    event: Event | null = makeEvent(),
    participants: AttendanceParticipant[] = [makeAttendanceParticipant()],
  ) {
    const eventRepository = createInMemoryEventRepository(event ? [event] : []);
    const participantRepository = createInMemoryParticipantRepository(participants);
    const service = createEventService(
      eventRepository,
      unusedGroupRepository,
      unusedUserRepository,
      participantRepository,
    );

    return { service, participantRepository };
  }

  it("permite a un usuario registrado confirmar su propia asistencia", async () => {
    const { service, participantRepository } = makeService();

    await expect(
      service.answerAttendance(
        "event-1",
        {
          type: "user",
          userId: "user-1",
        },
        "confirmed",
      ),
    ).resolves.toMatchObject({ attendanceState: "confirmed" });

    expect(participantRepository.updateAttendance).toHaveBeenCalledWith(
      "participant-1",
      "confirmed",
    );
  });

  it("permite a un participante anónimo rechazar su propia asistencia", async () => {
    const anonymousParticipant = makeAttendanceParticipant({
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    });
    const { service, participantRepository } = makeService(makeEvent(), [anonymousParticipant]);

    await expect(
      service.answerAttendance(
        "event-1",
        {
          type: "anonymousParticipant",
          participantId: "participant-anonymous",
          eventId: "event-1",
        },
        "rejected",
      ),
    ).resolves.toMatchObject({ attendanceState: "rejected" });

    expect(participantRepository.updateAttendance).toHaveBeenCalledWith(
      "participant-anonymous",
      "rejected",
    );
  });

  it.each(["not_confirmed", "maybe", "", null])(
    "rechaza el estado inválido %s antes de consultar persistencia",
    async (state) => {
      const { service, participantRepository } = makeService();

      await expect(
        service.answerAttendance(
          "event-1",
          {
            type: "user",
            userId: "user-1",
          },
          state,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(participantRepository.findAttendanceById).not.toHaveBeenCalled();
      expect(participantRepository.findAttendanceByEventIdAndUserId).not.toHaveBeenCalled();
      expect(participantRepository.updateAttendance).not.toHaveBeenCalled();
    },
  );

  it("devuelve 404 si el evento no existe", async () => {
    const { service, participantRepository } = makeService(null);

    await expect(
      service.answerAttendance(
        "event-unknown",
        {
          type: "user",
          userId: "user-1",
        },
        "confirmed",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(participantRepository.findAttendanceById).not.toHaveBeenCalled();
  });

  it("bloquea respuestas en eventos cancelados", async () => {
    const { service, participantRepository } = makeService(makeEvent({ status: "cancelled" }));

    await expect(
      service.answerAttendance(
        "event-1",
        {
          type: "user",
          userId: "user-1",
        },
        "confirmed",
      ),
    ).rejects.toBeInstanceOf(EventUnavailableError);
    expect(participantRepository.findAttendanceById).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el participante pertenece a otro evento", async () => {
    const { service, participantRepository } = makeService(makeEvent(), [
      makeAttendanceParticipant({ eventId: "event-2" }),
    ]);

    await expect(
      service.answerAttendance(
        "event-1",
        {
          type: "user",
          userId: "user-1",
        },
        "confirmed",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(participantRepository.updateAttendance).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el usuario no participa del evento", async () => {
    const { service, participantRepository } = makeService();

    await expect(
      service.answerAttendance(
        "event-1",
        {
          type: "user",
          userId: "user-2",
        },
        "confirmed",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(participantRepository.updateAttendance).not.toHaveBeenCalled();
  });

  it("impide que un anónimo responda por otro participante", async () => {
    const anonymousParticipant = makeAttendanceParticipant({
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    });
    const { service, participantRepository } = makeService(makeEvent(), [anonymousParticipant]);

    await expect(
      service.answerAttendance(
        "event-1",
        {
          type: "anonymousParticipant",
          participantId: "participant-other",
          eventId: "event-1",
        },
        "confirmed",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(participantRepository.updateAttendance).not.toHaveBeenCalled();
  });
});
