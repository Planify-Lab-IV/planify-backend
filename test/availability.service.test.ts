import { describe, expect, it, vi } from "vitest";
import type {
  AvailabilityRepository,
  AvailabilitySlot,
  AvailabilitySlotInput,
} from "../src/repositories/availability.repository.js";
import type { Event, EventRepository } from "../src/repositories/event.repository.js";
import type {
  AttendanceParticipant,
  ParticipantRepository,
} from "../src/repositories/participant.repository.js";
import { createAvailabilityService } from "../src/services/availability.service.js";
import { NotFoundError, ValidationError } from "../src/shared/errors/index.js";

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
    participants: [],
    ...overrides,
  };
}

function makeParticipant(overrides: Partial<AttendanceParticipant> = {}): AttendanceParticipant {
  return {
    id: "participant-1",
    eventId: "event-1",
    userId: "user-1",
    username: "Ana",
    isAnonymous: false,
    isOrganizer: false,
    attendanceState: "not_confirmed",
    ...overrides,
  };
}

function createEventRepository(event: Event | null): EventRepository {
  return {
    findById: vi.fn(async () => event),
    createAtomic: vi.fn(),
    cancelAtomic: vi.fn(),
  };
}

function createParticipantRepository(participants: AttendanceParticipant[]): ParticipantRepository {
  return {
    findById: vi.fn(),
    findByEventId: vi.fn(),
    findByEventIdAndUsername: vi.fn(),
    findAttendanceById: vi.fn(async (id) => {
      return participants.find((participant) => participant.id === id) ?? null;
    }),
    findAttendanceByEventIdAndUserId: vi.fn(async (eventId, userId) => {
      return (
        participants.find(
          (participant) => participant.eventId === eventId && participant.userId === userId,
        ) ?? null
      );
    }),
    createAnonymous: vi.fn(),
    updateAttendance: vi.fn(),
  };
}

function createAvailabilityRepository(
  initialSlots: AvailabilitySlot[] = [],
): AvailabilityRepository {
  let records = [...initialSlots];

  return {
    replaceForParticipant: vi.fn(async (eventId, participantId, slots) => {
      records = records.filter(
        (slot) => slot.eventId !== eventId || slot.participantId !== participantId,
      );
      records.push(...slots.map((slot) => ({ ...slot, eventId, participantId })));
    }),
    findForParticipant: vi.fn(async (eventId, participantId) => {
      return records.filter(
        (slot) => slot.eventId === eventId && slot.participantId === participantId,
      );
    }),
  };
}

function makeService(
  event: Event | null = makeEvent(),
  participants: AttendanceParticipant[] = [makeParticipant()],
  availabilityRepository: AvailabilityRepository = createAvailabilityRepository(),
) {
  const eventRepository = createEventRepository(event);
  const participantRepository = createParticipantRepository(participants);
  const service = createAvailabilityService(
    eventRepository,
    participantRepository,
    availabilityRepository,
  );

  return { service, eventRepository, participantRepository, availabilityRepository };
}

describe("AvailabilityService.save", () => {
  it("guarda los slots de un participante registrado", async () => {
    const { service, availabilityRepository } = makeService();
    const slots: AvailabilitySlotInput[] = [{ weekDay: 0, hourBlock: 9 }];

    await expect(
      service.save("event-1", { type: "user", userId: "user-1" }, slots),
    ).resolves.toBeUndefined();

    expect(availabilityRepository.replaceForParticipant).toHaveBeenCalledWith(
      "event-1",
      "participant-1",
      slots,
    );
  });

  it("guarda los slots de un participante anónimo de su propio evento", async () => {
    const anonymousParticipant = makeParticipant({
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    });
    const { service, availabilityRepository } = makeService(makeEvent(), [anonymousParticipant]);

    await service.save(
      "event-1",
      { type: "anonymousParticipant", participantId: "participant-anonymous", eventId: "event-1" },
      [{ weekDay: 6, hourBlock: 23 }],
    );

    expect(availabilityRepository.replaceForParticipant).toHaveBeenCalledWith(
      "event-1",
      "participant-anonymous",
      [{ weekDay: 6, hourBlock: 23 }],
    );
  });

  it("rechaza slots inválidos sin consultar ni modificar persistencia", async () => {
    const { service, eventRepository, availabilityRepository } = makeService();

    await expect(
      service.save("event-1", { type: "user", userId: "user-1" }, [{ weekDay: 7, hourBlock: 9 }]),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(eventRepository.findById).not.toHaveBeenCalled();
    expect(availabilityRepository.replaceForParticipant).not.toHaveBeenCalled();
  });

  it.each([
    [{ weekDay: -1, hourBlock: 9 }],
    [{ weekDay: 0, hourBlock: 24 }],
    [{ weekDay: 0.5, hourBlock: 9 }],
    [{ weekDay: 0, hourBlock: 9.5 }],
    [
      { weekDay: 0, hourBlock: 9 },
      { weekDay: 0, hourBlock: 9 },
    ],
  ])("rechaza una grilla inválida: %o", async (slots) => {
    const { service, availabilityRepository } = makeService();

    await expect(
      service.save("event-1", { type: "user", userId: "user-1" }, slots),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(availabilityRepository.replaceForParticipant).not.toHaveBeenCalled();
  });

  it("rechaza guardar en un evento cancelado sin modificar slots", async () => {
    const { service, participantRepository, availabilityRepository } = makeService(
      makeEvent({ status: "cancelled" }),
    );

    await expect(
      service.save("event-1", { type: "user", userId: "user-1" }, []),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(participantRepository.findAttendanceByEventIdAndUserId).not.toHaveBeenCalled();
    expect(availabilityRepository.replaceForParticipant).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el evento no existe", async () => {
    const { service, participantRepository, availabilityRepository } = makeService(null);

    await expect(
      service.save("event-unknown", { type: "user", userId: "user-1" }, []),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(participantRepository.findAttendanceByEventIdAndUserId).not.toHaveBeenCalled();
    expect(availabilityRepository.replaceForParticipant).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el actor no participa del evento", async () => {
    const { service, availabilityRepository } = makeService();

    await expect(
      service.save("event-1", { type: "user", userId: "user-other" }, []),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(availabilityRepository.replaceForParticipant).not.toHaveBeenCalled();
  });
});

describe("AvailabilityService.load", () => {
  it("devuelve la última selección completa sin exponer identificadores internos", async () => {
    const availabilityRepository = createAvailabilityRepository([
      { participantId: "participant-1", eventId: "event-1", weekDay: 0, hourBlock: 9 },
      { participantId: "participant-1", eventId: "event-1", weekDay: 4, hourBlock: 18 },
    ]);
    const { service } = makeService(makeEvent(), [makeParticipant()], availabilityRepository);

    await expect(service.load("event-1", { type: "user", userId: "user-1" })).resolves.toEqual([
      { weekDay: 0, hourBlock: 9 },
      { weekDay: 4, hourBlock: 18 },
    ]);
  });

  it("devuelve 404 al intentar precargar la disponibilidad de otro participante", async () => {
    const { service, availabilityRepository } = makeService();

    await expect(
      service.load("event-1", { type: "user", userId: "user-other" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(availabilityRepository.findForParticipant).not.toHaveBeenCalled();
  });
});
