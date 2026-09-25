import { describe, expect, it, vi } from "vitest";
import type { Event, EventRepository } from "../src/repositories/event.repository.js";
import type {
  AttendanceParticipant,
  ParticipantRepository,
} from "../src/repositories/participant.repository.js";
import type { Task, TaskRepository } from "../src/repositories/task.repository.js";
import { createTaskService } from "../src/services/task.service.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../src/shared/errors/index.js";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    groupId: "group-1",
    organizerId: "user-organizer",
    name: "Asado",
    location: "Casa de Ana",
    status: "active",
    startDateTime: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    participants: [],
    ...overrides,
  };
}

function makeParticipant(overrides: Partial<AttendanceParticipant> = {}): AttendanceParticipant {
  return {
    id: "participant-user",
    eventId: "event-1",
    userId: "user-1",
    username: "Ana",
    isAnonymous: false,
    isOrganizer: false,
    attendanceState: "not_confirmed",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    eventId: "event-1",
    title: "Comprar carne",
    status: "unassigned",
    assignedToParticipantId: null,
    createdByParticipantId: "participant-user",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function createEventRepository(events: Event[]): EventRepository {
  return {
    findById: vi.fn(async (id) => events.find((event) => event.id === id) ?? null),
    createAtomic: vi.fn(),
    cancelAtomic: vi.fn(),
    confirmSchedule: vi.fn(),
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

function createTaskRepository(initialTasks: Task[]): TaskRepository {
  const tasks = [...initialTasks];

  return {
    findById: vi.fn(async (id) => tasks.find((task) => task.id === id) ?? null),
    findByEventId: vi.fn(async (eventId) => tasks.filter((task) => task.eventId === eventId)),
    create: vi.fn(async (params) => {
      const task = makeTask({ id: `task-${tasks.length + 1}`, ...params });
      tasks.push(task);
      return task;
    }),
    update: vi.fn(async (id, params) => {
      const taskIndex = tasks.findIndex((task) => task.id === id);
      if (taskIndex === -1) {
        throw new Error("Tarea no encontrada");
      }

      const updatedTask = {
        ...tasks[taskIndex],
        ...params,
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      };
      tasks[taskIndex] = updatedTask;
      return updatedTask;
    }),
  };
}

function makeService(
  tasks: Task[] = [makeTask()],
  participants: AttendanceParticipant[] = [makeParticipant()],
  events: Event[] = [makeEvent()],
) {
  const taskRepository = createTaskRepository(tasks);
  const eventRepository = createEventRepository(events);
  const participantRepository = createParticipantRepository(participants);
  const service = createTaskService(taskRepository, eventRepository, participantRepository);

  return { service, taskRepository, eventRepository, participantRepository };
}

describe("TaskService", () => {
  it("crea una tarea sin asignar para el participante que actúa", async () => {
    const { service, taskRepository } = makeService([]);

    await expect(
      service.create("event-1", { type: "user", userId: "user-1" }, "  Comprar pan  "),
    ).resolves.toMatchObject({
      eventId: "event-1",
      title: "Comprar pan",
      status: "unassigned",
      assignedToParticipantId: null,
      createdByParticipantId: "participant-user",
    });

    expect(taskRepository.create).toHaveBeenCalledWith({
      eventId: "event-1",
      title: "Comprar pan",
      status: "unassigned",
      assignedToParticipantId: null,
      createdByParticipantId: "participant-user",
    });
  });

  it("lista solo las tareas del evento para un participante", async () => {
    const ownTask = makeTask();
    const otherTask = makeTask({ id: "task-2", eventId: "event-2" });
    const { service } = makeService([ownTask, otherTask]);

    await expect(service.list("event-1", { type: "user", userId: "user-1" })).resolves.toEqual([
      ownTask,
    ]);
  });

  it("permite a un participante anónimo crear una tarea en su evento", async () => {
    const anonymousParticipant = makeParticipant({
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    });
    const { service } = makeService([], [anonymousParticipant]);

    await expect(
      service.create(
        "event-1",
        {
          type: "anonymousParticipant",
          participantId: anonymousParticipant.id,
          eventId: "event-1",
        },
        "Hielo",
      ),
    ).resolves.toMatchObject({ createdByParticipantId: anonymousParticipant.id });
  });

  it("permite tomar una tarea sin asignar", async () => {
    const { service, taskRepository } = makeService();

    await expect(
      service.claim("task-1", { type: "user", userId: "user-1" }),
    ).resolves.toMatchObject({
      status: "pending",
      assignedToParticipantId: "participant-user",
    });

    expect(taskRepository.update).toHaveBeenCalledWith("task-1", {
      status: "pending",
      assignedToParticipantId: "participant-user",
    });
  });

  it("rechaza tomar una tarea que ya tiene dueño", async () => {
    const { service, taskRepository } = makeService([
      makeTask({ status: "pending", assignedToParticipantId: "participant-other" }),
    ]);

    await expect(
      service.claim("task-1", { type: "user", userId: "user-1" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(taskRepository.update).not.toHaveBeenCalled();
  });

  it("permite al organizador asignar una tarea a otro participante", async () => {
    const organizer = makeParticipant({
      id: "participant-organizer",
      userId: "user-organizer",
      isOrganizer: true,
    });
    const assignee = makeParticipant({ id: "participant-beto", userId: "user-beto" });
    const { service, taskRepository } = makeService([makeTask()], [organizer, assignee]);

    await expect(
      service.assignTo("task-1", assignee.id, { type: "user", userId: "user-organizer" }),
    ).resolves.toMatchObject({ status: "pending", assignedToParticipantId: assignee.id });

    expect(taskRepository.update).toHaveBeenCalledWith("task-1", {
      status: "pending",
      assignedToParticipantId: assignee.id,
    });
  });

  it("rechaza la asignación de quien no es organizador", async () => {
    const assignee = makeParticipant({ id: "participant-beto", userId: "user-beto" });
    const { service, taskRepository } = makeService([makeTask()], [makeParticipant(), assignee]);

    await expect(
      service.assignTo("task-1", assignee.id, { type: "user", userId: "user-1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(taskRepository.update).not.toHaveBeenCalled();
  });

  it("permite completar la tarea solo al participante asignado", async () => {
    const task = makeTask({ status: "pending", assignedToParticipantId: "participant-user" });
    const { service } = makeService([task]);

    await expect(
      service.complete("task-1", { type: "user", userId: "user-1" }),
    ).resolves.toMatchObject({ status: "completed", assignedToParticipantId: "participant-user" });
  });

  it("rechaza completar una tarea por otro participante", async () => {
    const task = makeTask({ status: "pending", assignedToParticipantId: "participant-owner" });
    const { service, taskRepository } = makeService([task]);

    await expect(
      service.complete("task-1", { type: "user", userId: "user-1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(taskRepository.update).not.toHaveBeenCalled();
  });

  it("rechaza operar una tarea de otro evento", async () => {
    const foreignTask = makeTask({ id: "task-foreign", eventId: "event-2" });
    const { service, taskRepository } = makeService([foreignTask]);

    await expect(
      service.claim("task-foreign", { type: "user", userId: "user-1" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(taskRepository.update).not.toHaveBeenCalled();
  });
});
