import type { Expense, ExpenseRepository } from "../repositories/expense.repository.js";
import type { DebtRepository, SimplifiedDebtRecord } from "../repositories/debt.repository.js";
import type { Event, EventRepository } from "../repositories/event.repository.js";
import type { AttendanceActor } from "../shared/auth/attendance.actor.js";
import {
  DebtAlreadySettledError,
  EventUnavailableError,
  ForbiddenError,
  NotFoundError,
} from "../shared/errors/index.js";
import { simplifyDebts, type ParticipantAmountCents } from "./debt-simplification.service.js";

export interface EventDebts {
  debts: SimplifiedDebtRecord[];
  allSettled: boolean;
}

export interface DebtSettlement {
  debt: SimplifiedDebtRecord;
  allEventDebtsSettled: boolean;
}

export interface DebtService {
  recalculateForEvent(eventId: string): Promise<void>;
  listEventDebts(eventId: string, actor: AttendanceActor): Promise<EventDebts>;
  settleDebt(eventId: string, debtId: string, actor: AttendanceActor): Promise<DebtSettlement>;
}

export function createDebtService(
  expenseRepository: ExpenseRepository,
  debtRepository: DebtRepository,
  eventRepository: EventRepository,
): DebtService {
  function resolveActorParticipantId(
    event: Event,
    eventId: string,
    actor: AttendanceActor,
  ): string {
    const participant =
      actor.type === "user"
        ? event.participants.find((candidate) => candidate.userId === actor.userId)
        : actor.eventId === eventId
          ? event.participants.find(
              (candidate) => candidate.id === actor.participantId && candidate.isAnonymous,
            )
          : undefined;

    if (!participant) {
      throw new ForbiddenError("No pertenecés a este evento");
    }

    return participant.id;
  }

  return {
    async recalculateForEvent(eventId: string): Promise<void> {
      const [expenses, settledDebts] = await Promise.all([
        expenseRepository.findByEventId(eventId),
        debtRepository.findSettledByEventId(eventId),
      ]);

      const participantAmounts = buildParticipantAmounts(expenses, settledDebts);
      const simplifiedDebts = simplifyDebts(participantAmounts);

      await debtRepository.replacePendingForEvent(eventId, simplifiedDebts);
    },

    async listEventDebts(eventId, actor) {
      const event = await eventRepository.findById(eventId);

      if (!event) {
        throw new NotFoundError("Evento no encontrado");
      }

      resolveActorParticipantId(event, eventId, actor);

      const debts = await debtRepository.findByEventId(eventId);

      return {
        debts,
        allSettled: debts.length > 0 && debts.every((debt) => debt.status === "settled"),
      };
    },

    async settleDebt(eventId, debtId, actor) {
      const event = await eventRepository.findById(eventId);

      if (!event) {
        throw new NotFoundError("Evento no encontrado");
      }
      if (event.status === "cancelled") {
        throw new EventUnavailableError();
      }

      const actorParticipantId = resolveActorParticipantId(event, eventId, actor);
      const debt = await debtRepository.findById(debtId);

      if (!debt || debt.eventId !== eventId) {
        throw new NotFoundError("Deuda no encontrada");
      }
      if (debt.debtor.id !== actorParticipantId && debt.creditor.id !== actorParticipantId) {
        throw new ForbiddenError("Solo el deudor o acreedor pueden saldar la deuda");
      }
      if (debt.status === "settled") {
        throw new DebtAlreadySettledError();
      }

      const settledAt = new Date();
      const affectedRows = await debtRepository.markSettled(debtId, settledAt);

      if (affectedRows === 0) {
        throw new DebtAlreadySettledError();
      }

      const debts = await debtRepository.findByEventId(eventId);

      return {
        debt: { ...debt, status: "settled", settledAt },
        allEventDebtsSettled:
          debts.length > 0 && debts.every((currentDebt) => currentDebt.status === "settled"),
      };
    },
  };
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
