import type { Expense, ExpenseRepository } from "../repositories/expense.repository.js";
import type { DebtRepository, SimplifiedDebtRecord } from "../repositories/debt.repository.js";
import type { EventRepository } from "../repositories/event.repository.js";
import type { AttendanceActor } from "../shared/auth/attendance.actor.js";
import { ForbiddenError, NotFoundError } from "../shared/errors/index.js";
import { simplifyDebts, type ParticipantAmountCents } from "./debt-simplification.service.js";

export interface EventDebts {
  debts: SimplifiedDebtRecord[];
  allSettled: boolean;
}

export interface DebtService {
  recalculateForEvent(eventId: string): Promise<void>;
  listEventDebts(eventId: string, actor: AttendanceActor): Promise<EventDebts>;
}

export function buildParticipantAmounts(
  expenses: Expense[],
  settledDebts: SimplifiedDebtRecord[],
): ParticipantAmountCents[] {
  const totals = new Map<string, { contributedCents: number; owedCents: number }>();

  function getOrCreate(participantId: string) {
    let entry = totals.get(participantId);
    if (!entry) {
      entry = { contributedCents: 0, owedCents: 0 };
      totals.set(participantId, entry);
    }
    return entry;
  }

  for (const expense of expenses) {
    for (const payer of expense.payers) {
      getOrCreate(payer.participantId).contributedCents += payer.amountCents;
    }
    for (const debtor of expense.debtors) {
      getOrCreate(debtor.participantId).owedCents += debtor.amountCents;
    }
  }

  for (const debt of settledDebts) {
    getOrCreate(debt.debtor.id).contributedCents += debt.amountCents;
    getOrCreate(debt.creditor.id).owedCents += debt.amountCents;
  }

  return [...totals.entries()].map(([participantId, { contributedCents, owedCents }]) => ({
    participantId,
    contributedCents,
    owedCents,
  }));
}

export function createDebtService(
  expenseRepository: ExpenseRepository,
  debtRepository: DebtRepository,
  eventRepository: EventRepository,
): DebtService {
  return {
    async listEventDebts(eventId, actor) {
      const event = await eventRepository.findById(eventId);

      if (!event) {
        throw new NotFoundError("Evento no encontrado");
      }

      const isAuthorized =
        actor.type === "user"
          ? event.participants.some((participant) => participant.userId === actor.userId)
          : actor.eventId === eventId &&
            event.participants.some(
              (participant) => participant.id === actor.participantId && participant.isAnonymous,
            );

      if (!isAuthorized) {
        throw new ForbiddenError("No pertenecés a este evento");
      }

      const debts = await debtRepository.findByEventId(eventId);

      return {
        debts,
        allSettled: debts.length > 0 && debts.every((debt) => debt.status === "settled"),
      };
    },

    async recalculateForEvent(eventId: string): Promise<void> {
      const [expenses, settledDebts] = await Promise.all([
        expenseRepository.findByEventId(eventId),
        debtRepository.findSettledByEventId(eventId),
      ]);

      const participantAmounts = buildParticipantAmounts(expenses, settledDebts);
      const simplifiedDebts = simplifyDebts(participantAmounts);

      await debtRepository.replacePendingForEvent(eventId, simplifiedDebts);
    },
  };
}
