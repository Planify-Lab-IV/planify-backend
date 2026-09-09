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
  createAnonymous: vi.fn(),
  updateAttendance: vi.fn(),
  invalidateAnonymousSessions: vi.fn(),
};

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
      service.answerAttendance("event-1", "participant-1", "confirmed", {
        type: "user",
        userId: "user-1",
      }),
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
      service.answerAttendance("event-1", "participant-anonymous", "rejected", {
        type: "anonymousParticipant",
        participantId: "participant-anonymous",
        eventId: "event-1",
      }),
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
        service.answerAttendance("event-1", "participant-1", state, {
          type: "user",
          userId: "user-1",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(participantRepository.findAttendanceById).not.toHaveBeenCalled();
      expect(participantRepository.updateAttendance).not.toHaveBeenCalled();
    },
  );

  it("devuelve 404 si el evento no existe", async () => {
    const { service, participantRepository } = makeService(null);

    await expect(
      service.answerAttendance("event-unknown", "participant-1", "confirmed", {
        type: "user",
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(participantRepository.findAttendanceById).not.toHaveBeenCalled();
  });

  it("bloquea respuestas en eventos cancelados", async () => {
    const { service, participantRepository } = makeService(makeEvent({ status: "cancelled" }));

    await expect(
      service.answerAttendance("event-1", "participant-1", "confirmed", {
        type: "user",
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(EventUnavailableError);
    expect(participantRepository.findAttendanceById).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el participante pertenece a otro evento", async () => {
    const { service, participantRepository } = makeService(makeEvent(), [
      makeAttendanceParticipant({ eventId: "event-2" }),
    ]);

    await expect(
      service.answerAttendance("event-1", "participant-1", "confirmed", {
        type: "user",
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(participantRepository.updateAttendance).not.toHaveBeenCalled();
  });

  it("impide que un usuario responda por otro participante", async () => {
    const { service, participantRepository } = makeService();

    await expect(
      service.answerAttendance("event-1", "participant-1", "confirmed", {
        type: "user",
        userId: "user-2",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
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
      service.answerAttendance("event-1", "participant-anonymous", "confirmed", {
        type: "anonymousParticipant",
        participantId: "participant-other",
        eventId: "event-1",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(participantRepository.updateAttendance).not.toHaveBeenCalled();
  });
});
