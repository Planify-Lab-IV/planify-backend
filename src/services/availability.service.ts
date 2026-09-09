import type {
  AvailabilityRepository,
  AvailabilitySlotInput,
} from "../repositories/availability.repository.js";
import type { EventRepository } from "../repositories/event.repository.js";
import type {
  AttendanceParticipant,
  ParticipantRepository,
} from "../repositories/participant.repository.js";
import type { AttendanceActor } from "../shared/middlewares/attendance.auth.middleware.js";
import { NotFoundError, ValidationError } from "../shared/errors/index.js";

export interface AvailabilityService {
  save(eventId: string, actor: AttendanceActor, slots: AvailabilitySlotInput[]): Promise<void>;
  load(eventId: string, actor: AttendanceActor): Promise<AvailabilitySlotInput[]>;
}

function validateEventId(eventId: string): void {
  if (typeof eventId !== "string" || eventId.trim() === "") {
    throw new ValidationError("El eventId es requerido");
  }
}

function validateSlots(slots: AvailabilitySlotInput[]): void {
  // --> Valida bloques de horarios
  if (!Array.isArray(slots)) {
    // --> Valida que realmente llegue el array de slots y no un json u otra cosa
    throw new ValidationError("Los slots de disponibilidad son inválidos");
  }

  const seenSlots = new Set<string>();

  for (const slot of slots) {
    if (
      !slot ||
      typeof slot.weekDay !== "number" ||
      !Number.isInteger(slot.weekDay) || // --> 2.5 no aceptado por ejemplo
      slot.weekDay < 0 ||
      slot.weekDay > 6 ||
      typeof slot.hourBlock !== "number" ||
      !Number.isInteger(slot.hourBlock) ||
      slot.hourBlock < 0 ||
      slot.hourBlock > 23
    ) {
      throw new ValidationError("Los slots de disponibilidad son inválidos");
    }

    const slotKey = `${slot.weekDay}:${slot.hourBlock}`;
    if (seenSlots.has(slotKey)) {
      throw new ValidationError("Los slots de disponibilidad no pueden repetirse");
    }
    seenSlots.add(slotKey);
  }
}

export function createAvailabilityService(
  eventRepository: EventRepository,
  participantRepository: ParticipantRepository,
  availabilityRepository: AvailabilityRepository,
): AvailabilityService {
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
    async save(eventId, actor, slots) {
      validateEventId(eventId);
      validateSlots(slots);

      const event = await eventRepository.findById(eventId);
      if (!event) {
        throw new NotFoundError("Evento no encontrado");
      }
      if (event.status === "cancelled") {
        throw new ValidationError("No se puede cargar disponibilidad en un evento cancelado");
      }

      const participant = await resolveParticipant(eventId, actor);
      await availabilityRepository.replaceForParticipant(eventId, participant.id, slots);
    },

    async load(eventId, actor) {
      validateEventId(eventId);

      const event = await eventRepository.findById(eventId);
      if (!event) {
        throw new NotFoundError("Evento no encontrado");
      }

      const participant = await resolveParticipant(eventId, actor);
      const slots = await availabilityRepository.findForParticipant(eventId, participant.id);

      return slots.map(({ weekDay, hourBlock }) => ({ weekDay, hourBlock }));
    },
  };
}
