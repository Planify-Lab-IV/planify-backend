import { describe, expect, it, vi } from "vitest";
import { type Event, type EventRepository } from "../src/repositories/event.repository.js";
import type { GroupRepository } from "../src/repositories/group.repository.js";
import type { UserRepository } from "../src/repositories/user.repository.js";
import { createEventService } from "../src/services/event.service.js";
import { ForbiddenError, NotFoundError } from "../src/shared/errors/index.js";

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

describe("EventService.cancel", () => {
  it("permite al participante organizador cancelar el evento", async () => {
    const eventRepository = createInMemoryEventRepository([makeEvent()]);
    const service = createEventService(
      eventRepository,
      unusedGroupRepository,
      unusedUserRepository,
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
    );

    await expect(service.cancel("user-organizer", "event-1")).resolves.toBe(cancelledEvent);
    expect(eventRepository.cancelAtomic).not.toHaveBeenCalled();
  });
});
