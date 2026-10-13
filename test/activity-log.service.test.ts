import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActivityLog,
  ActivityLogEntry,
  ActivityLogRepository,
  CountUnreadActivityLogParams,
  CreateActivityLogParams,
} from "../src/repositories/activity-log.repository.js";
import type { Event, EventRepository } from "../src/repositories/event.repository.js";
import type {
  AttendanceParticipant,
  ParticipantReadState,
  ParticipantRepository,
} from "../src/repositories/participant.repository.js";
import { createActivityLogService } from "../src/services/activity-log.service.js";
import { NotFoundError } from "../src/shared/errors/index.js";

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

function makeActivityLogEntry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: "activity-1",
    eventId: "event-1",
    type: "task_created",
    actorParticipantId: "participant-1",
    payload: { taskId: "task-1", title: "Comprar carne" },
    createdAt: new Date("2026-01-01T10:00:00Z"),
    actor: { id: "participant-1", username: "Ana" },
    ...overrides,
  };
}

function createEventRepository(events: Event[]): EventRepository {
  return {
    findById: vi.fn(async (eventId) => events.find((event) => event.id === eventId) ?? null),
    createAtomic: vi.fn(),
    cancelAtomic: vi.fn(),
    closeExpenses: vi.fn(),
    confirmSchedule: vi.fn(),
  };
}

function createParticipantRepository(
  participants: AttendanceParticipant[],
  readStates: ParticipantReadState[] = [],
): ParticipantRepository {
  return {
    findById: vi.fn(),
    findByEventId: vi.fn(),
    existsAnonymousWithUsername: vi.fn(async () => false),
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
    updateLastReadAt: vi.fn(),
    findParticipationsByUserId: vi.fn(async () => readStates),
  };
}

function createActivityLogRepository(entries: ActivityLogEntry[] = []): ActivityLogRepository {
  const records = [...entries];

  return {
    create: vi.fn(async (params: CreateActivityLogParams): Promise<ActivityLog> => {
      const entry = makeActivityLogEntry({
        id: `activity-${records.length + 1}`,
        eventId: params.eventId,
        type: params.type,
        actorParticipantId: params.actorParticipantId,
        payload: params.payload as ActivityLog["payload"],
        createdAt: new Date("2026-01-01T12:00:00Z"),
      });
      records.push(entry);

      return {
        id: entry.id,
        eventId: entry.eventId,
        type: entry.type,
        actorParticipantId: entry.actorParticipantId,
        payload: entry.payload,
        createdAt: entry.createdAt,
      };
    }),
    findByEventId: vi.fn(async (eventId) => {
      return records
        .filter((entry) => entry.eventId === eventId)
        .sort(
          (left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
        );
    }),
    countUnread: vi.fn(async ({ eventId, since, excludeActorParticipantId }) => {
      return records.filter(
        (entry) =>
          entry.eventId === eventId &&
          entry.actorParticipantId !== excludeActorParticipantId &&
          (!since || entry.createdAt > since),
      ).length;
    }),
  };
}

function makeService(
  entries: ActivityLogEntry[] = [],
  events: Event[] = [makeEvent()],
  participants: AttendanceParticipant[] = [makeParticipant()],
  readStates: ParticipantReadState[] = [],
) {
  const activityLogRepository = createActivityLogRepository(entries);
  const eventRepository = createEventRepository(events);
  const participantRepository = createParticipantRepository(participants, readStates);
  const service = createActivityLogService(
    activityLogRepository,
    eventRepository,
    participantRepository,
  );

  return { service, activityLogRepository, eventRepository, participantRepository };
}

afterEach(() => vi.restoreAllMocks());

describe("ActivityLogService.record", () => {
  it("persiste una actividad sin devolver un valor", async () => {
    const { service, activityLogRepository } = makeService();
    const params: CreateActivityLogParams = {
      eventId: "event-1",
      type: "task_created",
      actorParticipantId: "participant-1",
      payload: { taskId: "task-1", title: "Comprar carne" },
    };

    await expect(service.record(params)).resolves.toBeUndefined();
    expect(activityLogRepository.create).toHaveBeenCalledWith(params);
  });

  it("no propaga un error al persistir el feed", async () => {
    const { service, activityLogRepository } = makeService();
    const error = new Error("database unavailable");
    vi.mocked(activityLogRepository.create).mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      service.record({
        eventId: "event-1",
        type: "availability_updated",
        actorParticipantId: "participant-1",
        payload: { slotCount: 3 },
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "No se pudo registrar la actividad del evento",
      error,
    );
  });
});

describe("ActivityLogService.list", () => {
  it("devuelve las actividades del evento en el orden del repository", async () => {
    const newest = makeActivityLogEntry({
      id: "activity-2",
      createdAt: new Date("2026-01-01T11:00:00Z"),
    });
    const oldest = makeActivityLogEntry();
    const { service, activityLogRepository } = makeService([oldest, newest]);

    await expect(service.list("event-1", { type: "user", userId: "user-1" })).resolves.toEqual([
      newest,
      oldest,
    ]);
    expect(activityLogRepository.findByEventId).toHaveBeenCalledWith("event-1");
  });

  it("devuelve una lista vacía para un evento sin actividad", async () => {
    const { service } = makeService();

    await expect(service.list("event-1", { type: "user", userId: "user-1" })).resolves.toEqual([]);
  });

  it("permite listar a un participante anónimo de su evento", async () => {
    const anonymousParticipant = makeParticipant({
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    });
    const { service } = makeService([], [makeEvent()], [anonymousParticipant]);

    await expect(
      service.list("event-1", {
        type: "anonymousParticipant",
        participantId: anonymousParticipant.id,
        eventId: "event-1",
      }),
    ).resolves.toEqual([]);
  });

  it("devuelve not found si el actor no pertenece al evento", async () => {
    const { service, activityLogRepository } = makeService();

    await expect(
      service.list("event-1", { type: "user", userId: "user-outsider" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(activityLogRepository.findByEventId).not.toHaveBeenCalled();
  });

  it("devuelve not found si el evento no existe", async () => {
    const { service, participantRepository } = makeService([], []);

    await expect(
      service.list("event-unknown", { type: "user", userId: "user-1" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(participantRepository.findAttendanceByEventIdAndUserId).not.toHaveBeenCalled();
  });
});

describe("ActivityLogService.markAsRead", () => {
  it("guarda la marca de lectura del participante registrado", async () => {
    const { service, participantRepository } = makeService();

    await expect(
      service.markAsRead("event-1", { type: "user", userId: "user-1" }),
    ).resolves.toBeUndefined();

    expect(participantRepository.updateLastReadAt).toHaveBeenCalledWith(
      "participant-1",
      expect.any(Date),
    );
  });

  it("permite marcar como leído a un participante anónimo de su evento", async () => {
    const anonymousParticipant = makeParticipant({
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    });
    const { service, participantRepository } = makeService(
      [],
      [makeEvent()],
      [anonymousParticipant],
    );

    await service.markAsRead("event-1", {
      type: "anonymousParticipant",
      participantId: anonymousParticipant.id,
      eventId: "event-1",
    });

    expect(participantRepository.updateLastReadAt).toHaveBeenCalledWith(
      anonymousParticipant.id,
      expect.any(Date),
    );
  });

  it("no actualiza la marca si el actor no participa del evento", async () => {
    const { service, participantRepository } = makeService();

    await expect(
      service.markAsRead("event-1", { type: "user", userId: "user-outsider" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(participantRepository.updateLastReadAt).not.toHaveBeenCalled();
  });
});

describe("ActivityLogService.getUnreadCounts", () => {
  it("cuenta toda la actividad ajena cuando el evento nunca fue leído", async () => {
    const readState: ParticipantReadState = {
      participantId: "participant-1",
      eventId: "event-1",
      groupId: "group-1",
      lastReadAt: null,
    };
    const otherActivity = makeActivityLogEntry({
      id: "activity-other",
      actorParticipantId: "participant-2",
    });
    const ownActivity = makeActivityLogEntry({ id: "activity-own" });
    const { service, activityLogRepository } = makeService(
      [otherActivity, ownActivity],
      undefined,
      undefined,
      [readState],
    );

    await expect(service.getUnreadCounts("user-1")).resolves.toEqual({
      events: [{ eventId: "event-1", groupId: "group-1", unreadCount: 1 }],
      groups: [{ groupId: "group-1", unreadCount: 1 }],
    });
    expect(activityLogRepository.countUnread).toHaveBeenCalledWith({
      eventId: "event-1",
      since: null,
      excludeActorParticipantId: "participant-1",
    } satisfies CountUnreadActivityLogParams);
  });

  it("cuenta solo la actividad ajena posterior a la última lectura", async () => {
    const lastReadAt = new Date("2026-01-01T10:00:00Z");
    const readState: ParticipantReadState = {
      participantId: "participant-1",
      eventId: "event-1",
      groupId: "group-1",
      lastReadAt,
    };
    const beforeReading = makeActivityLogEntry({
      id: "activity-before",
      actorParticipantId: "participant-2",
      createdAt: new Date("2026-01-01T09:00:00Z"),
    });
    const afterReading = makeActivityLogEntry({
      id: "activity-after",
      actorParticipantId: "participant-2",
      createdAt: new Date("2026-01-01T11:00:00Z"),
    });
    const ownActivity = makeActivityLogEntry({
      id: "activity-own",
      createdAt: new Date("2026-01-01T12:00:00Z"),
    });
    const { service } = makeService(
      [beforeReading, afterReading, ownActivity],
      undefined,
      undefined,
      [readState],
    );

    await expect(service.getUnreadCounts("user-1")).resolves.toEqual({
      events: [{ eventId: "event-1", groupId: "group-1", unreadCount: 1 }],
      groups: [{ groupId: "group-1", unreadCount: 1 }],
    });
  });

  it("suma los conteos de eventos que pertenecen al mismo grupo", async () => {
    const readStates: ParticipantReadState[] = [
      { participantId: "participant-1", eventId: "event-1", groupId: "group-1", lastReadAt: null },
      { participantId: "participant-2", eventId: "event-2", groupId: "group-1", lastReadAt: null },
      { participantId: "participant-3", eventId: "event-3", groupId: "group-2", lastReadAt: null },
    ];
    const entries = [
      makeActivityLogEntry({ id: "event-1-activity", actorParticipantId: "other-1" }),
      makeActivityLogEntry({
        id: "event-2-activity-1",
        eventId: "event-2",
        actorParticipantId: "other-2",
      }),
      makeActivityLogEntry({
        id: "event-2-activity-2",
        eventId: "event-2",
        actorParticipantId: "other-3",
      }),
    ];
    const { service } = makeService(entries, undefined, undefined, readStates);

    await expect(service.getUnreadCounts("user-1")).resolves.toEqual({
      events: [
        { eventId: "event-1", groupId: "group-1", unreadCount: 1 },
        { eventId: "event-2", groupId: "group-1", unreadCount: 2 },
        { eventId: "event-3", groupId: "group-2", unreadCount: 0 },
      ],
      groups: [
        { groupId: "group-1", unreadCount: 3 },
        { groupId: "group-2", unreadCount: 0 },
      ],
    });
  });

  it("devuelve listas vacías para un usuario sin participaciones", async () => {
    const { service, activityLogRepository, participantRepository } = makeService(
      [],
      undefined,
      undefined,
      [],
    );

    await expect(service.getUnreadCounts("user-without-events")).resolves.toEqual({
      events: [],
      groups: [],
    });
    expect(participantRepository.findParticipationsByUserId).toHaveBeenCalledWith(
      "user-without-events",
    );
    expect(activityLogRepository.countUnread).not.toHaveBeenCalled();
  });
});
