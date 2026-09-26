import type { Expense, ExpenseRepository } from "../repositories/expense.repository.js";
import type { DebtRepository, SimplifiedDebtRecord } from "../repositories/debt.repository.js";
import { simplifyDebts, type ParticipantAmountCents } from "./debt-simplification.service.js";

export interface DebtService {
  recalculateForEvent(eventId: string): Promise<void>;
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
    getOrCreate(debt.debtorParticipantId).contributedCents += debt.amountCents;
    getOrCreate(debt.creditorParticipantId).owedCents += debt.amountCents;
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
): DebtService {
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
  };
}
