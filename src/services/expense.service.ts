import type {
  CreateExpenseParams,
  Expense,
  ExpenseRepository,
  ExpenseShareInput,
} from "../repositories/expense.repository.js";
import type { EventRepository } from "../repositories/event.repository.js";
import type { ParticipantRepository } from "../repositories/participant.repository.js";
import type { AttendanceActor } from "../shared/auth/attendance.actor.js";
import {
  EventUnavailableError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../shared/errors/index.js";
import type { CreateExpenseDTO } from "../validators/expense/create.expense.validator.js";

export interface ExpenseService {
  createExpense(eventId: string, actor: AttendanceActor, dto: CreateExpenseDTO): Promise<Expense>;
}

function hasRepeatedParticipantIds(shares: ExpenseShareInput[]): boolean {
  return new Set(shares.map((share) => share.participantId)).size !== shares.length;
}

function sumAmounts(shares: ExpenseShareInput[]): number {
  return shares.reduce((total, share) => total + share.amountCents, 0);
}

export function createExpenseService(
  expenseRepository: ExpenseRepository,
  eventRepository: EventRepository,
  participantRepository: ParticipantRepository,
): ExpenseService {
  return {
    async createExpense(eventId, actor, dto) {
      if (typeof eventId !== "string" || eventId.trim() === "") {
        throw new ValidationError("El eventId es requerido");
      }

      const event = await eventRepository.findById(eventId);
      if (!event) {
        throw new NotFoundError("Evento no encontrado");
      }
      if (event.status === "cancelled") {
        throw new EventUnavailableError();
      }

      if (hasRepeatedParticipantIds(dto.payers)) {
        throw new ValidationError("Los acreedores no pueden repetirse");
      }
      if (hasRepeatedParticipantIds(dto.debtors)) {
        throw new ValidationError("Los deudores no pueden repetirse");
      }

      const payerTotal = sumAmounts(dto.payers);
      if (payerTotal !== dto.totalAmountCents) {
        throw new ValidationError("La suma de acreedores debe coincidir con el total del gasto");
      }

      const debtorTotal = sumAmounts(dto.debtors);
      if (debtorTotal !== dto.totalAmountCents) {
        throw new ValidationError("La suma de deudores debe coincidir con el total del gasto");
      }

      let createdByParticipantId: string;
      if (actor.type === "user") {
        const creator = await participantRepository.findAttendanceByEventIdAndUserId(
          eventId,
          actor.userId,
        );

        if (!creator) {
          throw new ForbiddenError("El creador no pertenece al evento");
        }

        createdByParticipantId = creator.id;
      } else {
        const creator = await participantRepository.findById(actor.participantId);

        if (
          !creator ||
          !creator.isAnonymous ||
          creator.eventId !== eventId ||
          actor.eventId !== eventId
        ) {
          throw new ForbiddenError("El participante no pertenece al evento");
        }

        createdByParticipantId = creator.id;
      }

      const participants = await participantRepository.findByEventId(eventId);
      const participantIds = new Set(participants.map((participant) => participant.id));

      for (const participantId of [...dto.payers, ...dto.debtors].map(
        (share) => share.participantId,
      )) {
        if (!participantIds.has(participantId)) {
          throw new ValidationError("Todos los participantes deben pertenecer al evento");
        }
      }

      if (!participantIds.has(createdByParticipantId)) {
        throw new ValidationError("El creador no pertenece al evento");
      }

      const params: CreateExpenseParams = {
        eventId,
        description: dto.description,
        totalAmountCents: dto.totalAmountCents,
        createdByParticipantId,
        payers: dto.payers,
        debtors: dto.debtors,
      };

      return expenseRepository.createAtomic(params);
    },
  };
}
