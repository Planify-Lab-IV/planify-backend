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
import type { NotificationService } from "./notification.service.js";

export interface UnreadEventCount {
  eventId: string;
  groupId: string;
  unreadCount: number;
}

export interface UnreadGroupCount {
  groupId: string;
  unreadCount: number;
}

export interface UnreadCounts {
  events: UnreadEventCount[];
  groups: UnreadGroupCount[];
}

export interface ActivityLogService {
  record(params: CreateActivityLogParams): Promise<void>;
  list(eventId: string, actor: AttendanceActor): Promise<ActivityLogEntry[]>;
  markAsRead(eventId: string, actor: AttendanceActor): Promise<void>;
  getUnreadCounts(userId: string): Promise<UnreadCounts>;
}

export function createActivityLogService(
  activityLogRepository: ActivityLogRepository,
  eventRepository: EventRepository,
  participantRepository: ParticipantRepository,
  notificationService?: NotificationService,
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
        const entry = await activityLogRepository.create(params);

        if (notificationService) {
          void notificationService.notifyActivity(entry).catch(() => {
            console.error("No se pudo enviar la notificación de actividad");
          });
        }
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

    async markAsRead(eventId, actor) {
      validateEventId(eventId);
      await ensureEventExists(eventId);
      const participant = await resolveParticipant(eventId, actor);

      await participantRepository.updateLastReadAt(participant.id, new Date());
    },

    async getUnreadCounts(userId) {
      const participations = await participantRepository.findParticipationsByUserId(userId);
      const events = await Promise.all(
        participations.map(async ({ participantId, eventId, groupId, lastReadAt }) => ({
          eventId,
          groupId,
          unreadCount: await activityLogRepository.countUnread({
            eventId,
            since: lastReadAt,
            excludeActorParticipantId: participantId,
          }),
        })),
      );
      const groupCounts = new Map<string, number>();

      for (const { groupId, unreadCount } of events) {
        groupCounts.set(groupId, (groupCounts.get(groupId) ?? 0) + unreadCount);
      }

      return {
        events,
        groups: Array.from(groupCounts, ([groupId, unreadCount]) => ({ groupId, unreadCount })),
      };
    },
  };
}
