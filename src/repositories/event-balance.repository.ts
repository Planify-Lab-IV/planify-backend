import type { Prisma } from "@prisma/client";
import { prisma } from "../infrastructure/prisma.js";
import type { SimplifiedDebt } from "../services/debt-simplification.service.js";
import type { SimplifiedDebtRecord } from "./debt.repository.js";
import type { Expense } from "./expense.repository.js";

export interface EventBalanceTransaction {
  findExpenses(): Promise<Expense[]>;
  findSettledDebts(): Promise<SimplifiedDebtRecord[]>;
  replacePendingDebts(debts: SimplifiedDebt[]): Promise<void>;
  findDebt(debtId: string): Promise<SimplifiedDebtRecord | null>;
  settleDebt(debtId: string, settledAt: Date): Promise<number>;
  findDebts(): Promise<SimplifiedDebtRecord[]>;
}

export interface EventBalanceRepository {
  withinLockedTransaction<T>(
    eventId: string,
    operation: (transaction: EventBalanceTransaction) => Promise<T>,
  ): Promise<T>;
}

function createEventBalanceTransaction(
  transactionClient: Prisma.TransactionClient,
  eventId: string,
): EventBalanceTransaction {
  return {
    async findExpenses() {
      return transactionClient.expense.findMany({
        where: { eventId },
        include: {
          payers: true,
          debtors: true,
        },
        orderBy: { createdAt: "asc" },
      });
    },

    async findSettledDebts() {
      return transactionClient.simplifiedDebt.findMany({
        where: { eventId, status: "settled" },
        select: {
          id: true,
          eventId: true,
          amountCents: true,
          status: true,
          settledAt: true,
          createdAt: true,
          debtor: { select: { id: true, username: true } },
          creditor: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    },

    async replacePendingDebts(debts) {
      await transactionClient.simplifiedDebt.deleteMany({
        where: { eventId, status: "pending" },
      });

      if (debts.length > 0) {
        await transactionClient.simplifiedDebt.createMany({
          data: debts.map((debt) => ({
            eventId,
            debtorParticipantId: debt.debtorParticipantId,
            creditorParticipantId: debt.creditorParticipantId,
            amountCents: debt.amountCents,
            status: "pending",
          })),
        });
      }
    },

    async findDebt(debtId) {
      return transactionClient.simplifiedDebt.findFirst({
        where: { id: debtId, eventId },
        select: {
          id: true,
          eventId: true,
          amountCents: true,
          status: true,
          settledAt: true,
          createdAt: true,
          debtor: { select: { id: true, username: true } },
          creditor: { select: { id: true, username: true } },
        },
      });
    },

    async settleDebt(debtId, settledAt) {
      const { count } = await transactionClient.simplifiedDebt.updateMany({
        where: { id: debtId, eventId, status: "pending" },
        data: { status: "settled", settledAt },
      });

      return count;
    },

    async findDebts() {
      return transactionClient.simplifiedDebt.findMany({
        where: { eventId },
        select: {
          id: true,
          eventId: true,
          amountCents: true,
          status: true,
          settledAt: true,
          createdAt: true,
          debtor: { select: { id: true, username: true } },
          creditor: { select: { id: true, username: true } },
        },
        orderBy: [{ status: "asc" }, { amountCents: "desc" }, { id: "asc" }],
      });
    },
  };
}

export const eventBalanceRepository: EventBalanceRepository = {
  async withinLockedTransaction(eventId, operation) {
    return prisma.$transaction(async (tx) => {
      // El bloqueo vive en PostgreSQL, por lo que también coordina requests
      // atendidos por procesos o instancias distintas de la aplicación.
      await tx.$queryRaw`
        SELECT id
        FROM evento
        WHERE id = ${eventId}
        FOR UPDATE
      `;

      return operation(createEventBalanceTransaction(tx, eventId));
    });
  },
};
