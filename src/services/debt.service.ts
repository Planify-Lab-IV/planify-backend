import type { Expense, ExpenseRepository } from "../repositories/expense.repository.js";
import type {
  DebtForUserRecord,
  DebtParticipantForUserRecord,
  DebtRepository,
  SimplifiedDebtRecord,
} from "../repositories/debt.repository.js";
import type {
  BalanceDirection,
  PersonBalance,
  PersonBalanceDetail,
  PersonBalanceStatus,
  PersonKey,
  UserBalanceSummary,
} from "../types/balance.js";
import { simplifyDebts, type ParticipantAmountCents } from "./debt-simplification.service.js";
import { NotFoundError, ValidationError } from "../shared/errors/index.js";

export type { UserBalanceSummary } from "../types/balance.js";

export interface DebtService {
  recalculateForEvent(eventId: string): Promise<void>;
  getBalanceSummary(userId: string): Promise<UserBalanceSummary>;
  getPeopleBalances(userId: string): Promise<PersonBalance[]>;
  getPersonDetail(userId: string, personKey: string): Promise<PersonBalanceDetail>;
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

    async getBalanceSummary(userId: string): Promise<UserBalanceSummary> {
      const debts = await debtRepository.findByUserId(userId, { statuses: ["pending"] });
      let owedToMeCents = 0;
      let iOweCents = 0;

      for (const debt of debts) {
        if (debt.status !== "pending") continue;

        if (debt.creditor.userId === userId) {
          owedToMeCents += debt.amountCents;
        }

        if (debt.debtor.userId === userId) {
          iOweCents += debt.amountCents;
        }
      }

      return { owedToMeCents, iOweCents };
    },

    async getPeopleBalances(userId: string): Promise<PersonBalance[]> {
      const debts = await debtRepository.findByUserId(userId, {
        statuses: ["pending", "settled"],
      });
      const details = buildPersonBalanceDetails(userId, debts);

      return details.map(({ personKey, displayName, status, netCents }) => ({
        personKey,
        displayName,
        status,
        netCents,
      }));
    },

    async getPersonDetail(userId: string, personKey: string): Promise<PersonBalanceDetail> {
      if (!isPersonKey(personKey)) {
        throw new ValidationError("La clave de persona es inválida");
      }

      const debts = await debtRepository.findByUserId(userId, {
        statuses: ["pending", "settled"],
      });
      const detail = buildPersonBalanceDetails(userId, debts).find(
        (balance) => balance.personKey === personKey,
      );

      if (!detail) {
        throw new NotFoundError("No hay deudas con la persona solicitada");
      }

      return detail;
    },
  };
}

function getCounterPart(
  debt: DebtForUserRecord,
  userId: string,
): { counterpart: DebtParticipantForUserRecord; direction: BalanceDirection } {
  if (debt.debtor.userId === userId) {
    return { counterpart: debt.creditor, direction: "i_owe" };
  }

  if (debt.creditor.userId === userId) {
    return { counterpart: debt.debtor, direction: "owed_to_me" };
  }

  throw new Error("La deuda no pertenece al usuario consultado");
}

function getPersonBalanceStatus(netCents: number): PersonBalanceStatus {
  if (netCents < 0) return "pay";
  if (netCents > 0) return "pending";
  return "settled";
}

function buildPersonBalanceDetails(
  userId: string,
  debts: DebtForUserRecord[],
): PersonBalanceDetail[] {
  const balances = new Map<PersonKey, PersonBalanceDetail>();

  for (const debt of debts) {
    const { counterpart, direction } = getCounterPart(debt, userId);
    const personKey = toPersonKey(counterpart);
    const balance = getBalance(balances, personKey, counterpart);

    if (debt.status === "pending") {
      const netCents = direction === "i_owe" ? -debt.amountCents : debt.amountCents;
      balance.netCents += netCents;
      balance.breakdown.push({
        eventId: debt.eventId,
        eventName: debt.eventName,
        amountCents: debt.amountCents,
        direction,
      });
    }

    balances.set(personKey, balance);
  }

  return [...balances.values()].map((balance) => ({
    ...balance,
    status: getPersonBalanceStatus(balance.netCents),
  }));
}

function getBalance(
  balances: Map<PersonKey, PersonBalanceDetail>,
  personKey: PersonKey,
  counterpart: DebtParticipantForUserRecord,
) {
  return (
    balances.get(personKey) ?? {
      personKey,
      displayName: counterpart.userName ?? counterpart.participantUsername,
      status: "settled" as const,
      netCents: 0,
      breakdown: [],
    }
  );
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

export function toPersonKey(participant: {
  participantId: string;
  userId: string | null;
}): PersonKey {
  return participant.userId
    ? `user:${participant.userId}`
    : `participant:${participant.participantId}`;
}

export function isPersonKey(value: string): value is PersonKey {
  return /^(user|participant):[^:]+$/.test(value);
}
