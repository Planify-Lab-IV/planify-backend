import type {
  ActivityLogEntry,
  ActivityLogRepository,
  CreateActivityLogParams,
} from "../repositories/activity-log.repository.js";
import type { EventRepository } from "../repositories/event.repository.js";
import type {
  AttendanceParticipant,
  ParticipantRepository,
} from "../repositories/participant.repository.js";
import type { AttendanceActor } from "../shared/auth/attendance.actor.js";
import { NotFoundError } from "../shared/errors/index.js";
import { validateEventId } from "../shared/event-id.js";

export interface ActivityLogService {
  record(params: CreateActivityLogParams): Promise<void>;
  list(eventId: string, actor: AttendanceActor): Promise<ActivityLogEntry[]>;
}

export function createActivityLogService(
  activityLogRepository: ActivityLogRepository,
  eventRepository: EventRepository,
  participantRepository: ParticipantRepository,
): ActivityLogService {
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

  return {
    async record(params) {
      try {
        await activityLogRepository.create(params);
      } catch (error) {
        console.error("No se pudo registrar la actividad del evento", error);
      }
    },

    async list(eventId, actor) {
      validateEventId(eventId);
      await ensureEventExists(eventId);
      await resolveParticipant(eventId, actor);

      return activityLogRepository.findByEventId(eventId);
    },
  };
}
