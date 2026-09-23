import type { EventRepository } from "../repositories/event.repository.js";
import type {
  AttendanceParticipant,
  ParticipantRepository,
} from "../repositories/participant.repository.js";
import type { Task, TaskRepository } from "../repositories/task.repository.js";
import type { AttendanceActor } from "../shared/auth/attendance.actor.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../shared/errors/index.js";

export interface TaskService {
  list(eventId: string, actor: AttendanceActor): Promise<Task[]>;
  create(eventId: string, actor: AttendanceActor, title: string): Promise<Task>;
  claim(taskId: string, actor: AttendanceActor): Promise<Task>;
  assignTo(taskId: string, participantId: string, actor: AttendanceActor): Promise<Task>;
  complete(taskId: string, actor: AttendanceActor): Promise<Task>;
}

function validateEventId(eventId: string): void {
  if (typeof eventId !== "string" || eventId.trim() === "") {
    throw new ValidationError("El eventId es requerido");
  }
}

function validateTitle(title: string): string {
  if (typeof title !== "string" || title.trim() === "") {
    throw new ValidationError("El titulo de la tarea es requerido");
  }

  return title.trim();
}

// Esta función construye y devuelve el servicio de tareas
// Los metodos retornados conservan acceso a los repositories y helpers definidos aca
// mediante una closure, sin tener que recibirlos como parametros en cada llamada

export function createTaskService(
  taskRepository: TaskRepository,
  eventRepository: EventRepository,
  participantRepository: ParticipantRepository,
): TaskService {
  async function ensureEventExists(eventId: string): Promise<void> {
    const event = await eventRepository.findById(eventId);
    if (!event) {
      throw new NotFoundError("Evento no encontrado");
    }
  }

  async function resolveParticipant(
    eventId: string,
    actor: AttendanceActor,
  ): Promise<AttendanceParticipant> {
    const participant =
      actor.type === "user"
        ? await participantRepository.findAttendanceByEventIdAndUserId(eventId, actor.userId)
        : await participantRepository.findAttendanceById(actor.participantId);

    if (
      !participant ||
      participant.eventId !== eventId ||
      (actor.type === "anonymousParticipant" &&
        (!participant.isAnonymous || actor.eventId !== eventId))
    ) {
      throw new NotFoundError("Participante no encontrado");
    }

    return participant;
  }

  async function findTask(taskId: string): Promise<Task> {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new NotFoundError("Tarea no encontrada");
    }

    return task;
  }

  return {
    async list(eventId, actor) {
      validateEventId(eventId);
      await ensureEventExists(eventId);
      await resolveParticipant(eventId, actor);

      return taskRepository.findByEventId(eventId);
    },

    async create(eventId, actor, title) {
      validateEventId(eventId);
      const cleanTitle = validateTitle(title);
      await ensureEventExists(eventId);
      const participant = await resolveParticipant(eventId, actor);

      return taskRepository.create({
        eventId,
        title: cleanTitle,
        status: "unassigned",
        assignedToParticipantId: null,
        createdByParticipantId: participant.id,
      });
    },

    async claim(taskId, actor) {
      const task = await findTask(taskId);
      const participant = await resolveParticipant(task.eventId, actor);

      if (task.status !== "unassigned") {
        throw new ValidationError("La tarea ya tiene un participante asignado");
      }

      return taskRepository.update(task.id, {
        status: "pending",
        assignedToParticipantId: participant.id,
      });
    },

    async assignTo(taskId, participantId, actor) {
      const task = await findTask(taskId);
      const actorParticipant = await resolveParticipant(task.eventId, actor);

      if (!actorParticipant.isOrganizer) {
        throw new ForbiddenError("Solo el organizador puede asignar tareas");
      }

      const assignee = await participantRepository.findAttendanceById(participantId);
      if (!assignee || assignee.eventId !== task.eventId) {
        throw new NotFoundError("Participante no encontrado");
      }

      return taskRepository.update(task.id, {
        status: "pending",
        assignedToParticipantId: assignee.id,
      });
    },

    async complete(taskId, actor) {
      const task = await findTask(taskId);
      const participant = await resolveParticipant(task.eventId, actor);

      if (task.assignedToParticipantId !== participant.id) {
        throw new ForbiddenError("Solo el participante asignado puede completar la tarea");
      }

      return taskRepository.update(task.id, {
        status: "completed",
        assignedToParticipantId: participant.id,
      });
    },
  };
}
