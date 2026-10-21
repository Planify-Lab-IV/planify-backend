import type { ActivityLog } from "../repositories/activity-log.repository.js";
import type { EventRepository } from "../repositories/event.repository.js";
import type { ParticipantRepository } from "../repositories/participant.repository.js";
import type { PushDeviceRepository } from "../repositories/push-device.repository.js";
import type { PushMessage, PushNotifier } from "../infrastructure/notifications/push.notifier.js";

const notifiableActivityTypes = new Set<ActivityLog["type"]>([
  "task_created",
  "expense_created",
  "schedule_confirmed",
]);

export interface NotificationService {
  registerDevice(userId: string, token: string): Promise<void>;
  unregisterDevice(userId: string, token: string): Promise<void>;
  notifyActivity(entry: ActivityLog): Promise<void>;
}

export function createNotificationService(
  pushDeviceRepository: PushDeviceRepository,
  pushNotifier: PushNotifier,
  eventRepository: EventRepository,
  participantRepository: ParticipantRepository,
): NotificationService {
  return {
    async registerDevice(userId, token) {
      await pushDeviceRepository.upsertByToken({ userId, token });
    },

    async unregisterDevice(userId, token) {
      await pushDeviceRepository.deleteByToken(token, userId);
    },

    async notifyActivity(entry) {
      if (!notifiableActivityTypes.has(entry.type)) {
        return;
      }

      const tokens = await pushDeviceRepository.findByEventRecipients(
        entry.eventId,
        entry.actorParticipantId,
      );
      if (tokens.length === 0) {
        return;
      }

      const [event, actor] = await Promise.all([
        eventRepository.findById(entry.eventId),
        participantRepository.findById(entry.actorParticipantId),
      ]);
      if (!event || !actor || actor.eventId !== entry.eventId) {
        console.error("No se pudo preparar la notificación de actividad del evento");
        return;
      }

      const message = buildActivityPushMessage({
        type: entry.type,
        payload: entry.payload,
        actorUsername: actor.username,
        eventName: event.name,
        eventId: entry.eventId,
      });
      const { invalidTokens } = await pushNotifier.send(tokens, message);

      if (invalidTokens.length > 0) {
        await pushDeviceRepository.deleteByTokens(invalidTokens);
      }
    },
  };
}

export function buildActivityPushMessage({
  type,
  payload,
  actorUsername,
  eventName,
  eventId,
}: {
  type: ActivityLog["type"];
  payload: ActivityLog["payload"];
  actorUsername: string;
  eventName: string;
  eventId: string;
}): PushMessage {
  return {
    title: eventName,
    body: buildBody(type, payload, actorUsername),
    eventId,
    activityType: type,
  };
}

function buildBody(
  type: ActivityLog["type"],
  payload: ActivityLog["payload"],
  actor: string,
): string {
  const data = isRecord(payload) ? payload : null;

  if (type === "task_created") {
    const title = data?.title;
    return typeof title === "string" && title.trim() !== ""
      ? `${actor} agregó una nueva tarea: "${title}".`
      : `${actor} agregó una tarea.`;
  }

  if (type === "expense_created") {
    const description = data?.description;
    const totalAmountCents = data?.totalAmountCents;
    return typeof description === "string" &&
      description.trim() !== "" &&
      typeof totalAmountCents === "number" &&
      Number.isFinite(totalAmountCents)
      ? `${actor} agregó un gasto de ${formatAmount(totalAmountCents)}: "${description}".`
      : `${actor} agregó un gasto.`;
  }

  if (type === "schedule_confirmed") {
    return `${actor} confirmó el horario del evento.`;
  }

  return `${actor} agregó una actividad al evento.`;
}

function formatAmount(totalAmountCents: number): string {
  const hasDecimals = Math.abs(totalAmountCents) % 100 !== 0;
  const amount = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(totalAmountCents / 100);

  return `$${amount}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
