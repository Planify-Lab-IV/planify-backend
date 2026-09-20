import type {
  CreateExpenseParams,
  Expense,
  ExpenseRepository,
  ExpenseShareInput,
} from "../repositories/expense.repository.js";
import type { ParticipantRepository } from "../repositories/participant.repository.js";
import type { AttendanceActor } from "../shared/auth/attendance.actor.js";
import { ValidationError } from "../shared/errors/index.js";
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
  participantRepository: ParticipantRepository,
): ExpenseService {
  return {
    async createExpense(eventId, actor, dto) {
      if (typeof eventId !== "string" || eventId.trim() === "") {
        throw new ValidationError("El eventId es requerido");
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

      if (actor.type === "anonymousParticipant" && actor.eventId !== eventId) {
        throw new ValidationError("El participante no pertenece al evento");
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

      let createdByParticipantId: string;
      if (actor.type === "user") {
        const creator = await participantRepository.findAttendanceByEventIdAndUserId(
          eventId,
          actor.userId,
        );

        if (!creator) {
          throw new ValidationError("El creador no pertenece al evento");
        }

        createdByParticipantId = creator.id;
      } else {
        createdByParticipantId = actor.participantId;
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
