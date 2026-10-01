import type { Expense, ExpenseRepository } from "../repositories/expense.repository.js";
import type {
  DebtForUserRecord,
  DebtParticipantForUserRecord,
  DebtRepository,
  SimplifiedDebtRecord,
} from "../repositories/debt.repository.js";
import { parsePersonKey } from "../types/balance.js";
import type {
  BalanceDirection,
  PersonBalance,
  PersonBalanceDetail,
  PersonBalanceStatus,
  PersonKey,
  ParsedPersonKey,
  UserBalanceSummary,
} from "../types/balance.js";
import type { AttendanceActor } from "../shared/auth/attendance.actor.js";
import {
  DebtAlreadySettledError,
  EventUnavailableError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../shared/errors/index.js";
import { simplifyDebts, type ParticipantAmountCents } from "./debt-simplification.service.js";
import type { Event, EventRepository } from "../repositories/event.repository.js";
export { isPersonKey, parsePersonKey } from "../types/balance.js";

export interface EventDebts {
  debts: SimplifiedDebtRecord[];
  allSettled: boolean;
}

export interface DebtSettlement {
  debt: SimplifiedDebtRecord;
  allEventDebtsSettled: boolean;
}

export interface PersonDebtSettlementEvent {
  eventId: string;
  allDebtsSettled: boolean;
}

export interface PersonDebtSettlement {
  settledCount: number;
  events: PersonDebtSettlementEvent[];
}

export interface DebtService {
  recalculateForEvent(eventId: string): Promise<void>;
  listEventDebts(eventId: string, actor: AttendanceActor): Promise<EventDebts>;
  getBalanceSummary(userId: string): Promise<UserBalanceSummary>;
  getPeopleBalances(userId: string): Promise<PersonBalance[]>;
  getPersonDetail(userId: string, personKey: string): Promise<PersonBalanceDetail>;
  settleWithPerson(userId: string, personKey: string): Promise<PersonDebtSettlement>;
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

  function parseRequiredPersonKey(personKey: string): ParsedPersonKey {
    const parsedPersonKey = parsePersonKey(personKey);

    if (!parsedPersonKey) {
      throw new ValidationError("La clave de persona es inválida");
    }

    return parsedPersonKey;
  }

  async function findPersonDetail(userId: string, personKey: string): Promise<PersonBalanceDetail> {
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
      parseRequiredPersonKey(personKey);

      return findPersonDetail(userId, personKey);
    },

    async settleWithPerson(userId: string, personKey: string): Promise<PersonDebtSettlement> {
      const counterpart = parseRequiredPersonKey(personKey);

      if (counterpart.type === "user" && counterpart.userId === userId) {
        throw new ValidationError("No podés saldar deudas con vos mismo");
      }

      await findPersonDetail(userId, personKey);

      return debtRepository.withinTransaction(async (transaction) => {
        const pendingDebts = await transaction.findPendingBetween(userId, counterpart);

        if (pendingDebts.length === 0) {
          return { settledCount: 0, events: [] };
        }

        const settledAt = new Date();
        const settledCount = await transaction.markManySettled(
          pendingDebts.map((debt) => debt.id),
          settledAt,
        );
        const affectedEventIds = [...new Set(pendingDebts.map((debt) => debt.eventId))].sort();
        const eventIdsWithPendingDebts = new Set(
          await transaction.findPendingEventIds(affectedEventIds),
        );

        return {
          settledCount,
          events: affectedEventIds.map((eventId) => ({
            eventId,
            allDebtsSettled: !eventIdsWithPendingDebts.has(eventId),
          })),
        };
      });
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
    getOrCreate(debt.debtor.id).contributedCents += debt.amountCents;
    getOrCreate(debt.creditor.id).owedCents += debt.amountCents;
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
