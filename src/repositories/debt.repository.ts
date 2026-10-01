import type { Prisma } from "@prisma/client";
import { prisma } from "../infrastructure/prisma.js";
import type { SimplifiedDebt } from "../services/debt-simplification.service.js";
import type { ParsedPersonKey } from "../types/balance.js";

export type DebtStatus = "pending" | "settled";

export interface SimplifiedDebtRecord {
  id: string;
  eventId: string;
  amountCents: number;
  status: DebtStatus;
  settledAt: Date | null;
  createdAt: Date;
  debtor: DebtParticipantData;
  creditor: DebtParticipantData;
}

export interface DebtParticipantData {
  id: string;
  username: string;
}

export interface FindByUserIdOptions {
  statuses: DebtStatus[];
}

export interface DebtParticipantForUserRecord {
  participantId: string;
  userId: string | null;
  participantUsername: string;
  userName: string | null;
}

export interface DebtForUserRecord {
  debtor: DebtParticipantForUserRecord;
  creditor: DebtParticipantForUserRecord;
  amountCents: number;
  status: DebtStatus;
  eventId: string;
  eventName: string;
}

export interface PendingDebtReference {
  id: string;
  eventId: string;
}

export interface DebtSettlementTransaction {
  // Estas operaciones solo se exponen dentro de la transacción del saldado en cascada.
  findPendingBetween(userId: string, counterpart: ParsedPersonKey): Promise<PendingDebtReference[]>;
  findPendingEventIds(eventIds: string[]): Promise<string[]>;
  markManySettled(ids: string[], settledAt: Date): Promise<number>;
}

export interface DebtRepository {
  findById(debtId: string): Promise<SimplifiedDebtRecord | null>;
  findByEventId(eventId: string): Promise<SimplifiedDebtRecord[]>;
  findSettledByEventId(eventId: string): Promise<SimplifiedDebtRecord[]>;
  markSettled(debtId: string, settledAt: Date): Promise<number>;
  findByUserId(userId: string, statusOptions: FindByUserIdOptions): Promise<DebtForUserRecord[]>;
  replacePendingForEvent(eventId: string, debts: SimplifiedDebt[]): Promise<void>;
  withinTransaction<T>(
    operation: (transaction: DebtSettlementTransaction) => Promise<T>,
  ): Promise<T>;
}

function toCounterpartFilter(counterpart: ParsedPersonKey) {
  return counterpart.type === "user"
    ? { userId: counterpart.userId }
    : { id: counterpart.participantId, userId: null, isAnonymous: true };
}

// Recibe el cliente `tx` creado por Prisma, no el cliente global. Así cada consulta
// participa de la misma transacción y un error revierte todos los cambios del saldado.
function createDebtSettlementTransaction(
  transactionClient: Prisma.TransactionClient,
): DebtSettlementTransaction {
  return {
    async findPendingBetween(userId, counterpart) {
      return transactionClient.simplifiedDebt.findMany({
        where: {
          status: "pending",
          OR: [
            { debtor: { userId }, creditor: toCounterpartFilter(counterpart) },
            { debtor: toCounterpartFilter(counterpart), creditor: { userId } },
          ],
        },
        select: { id: true, eventId: true },
        orderBy: { id: "asc" },
      });
    },

    async markManySettled(ids, settledAt) {
      if (ids.length === 0) {
        return 0;
      }

      const { count } = await transactionClient.simplifiedDebt.updateMany({
        where: { id: { in: ids }, status: "pending" },
        data: { status: "settled", settledAt },
      });

      return count;
    },

    async findPendingEventIds(eventIds) {
      if (eventIds.length === 0) {
        return [];
      }

      const debts = await transactionClient.simplifiedDebt.findMany({
        where: { eventId: { in: eventIds }, status: "pending" },
        select: { eventId: true },
        distinct: ["eventId"],
        orderBy: { eventId: "asc" },
      });

      return debts.map((debt) => debt.eventId);
    },
  };
}

export const debtRepository: DebtRepository = {
  async findById(debtId: string): Promise<SimplifiedDebtRecord | null> {
    return prisma.simplifiedDebt.findUnique({
      where: { id: debtId },
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

  async findByEventId(eventId: string): Promise<SimplifiedDebtRecord[]> {
    return prisma.simplifiedDebt.findMany({
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

  async findSettledByEventId(eventId: string): Promise<SimplifiedDebtRecord[]> {
    return prisma.simplifiedDebt.findMany({
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

  async markSettled(debtId: string, settledAt: Date): Promise<number> {
    const { count } = await prisma.simplifiedDebt.updateMany({
      where: { id: debtId, status: "pending" },
      data: { status: "settled", settledAt },
    });

    return count;
  },

  async findByUserId(
    userId: string,
    statusOptions: FindByUserIdOptions,
  ): Promise<DebtForUserRecord[]> {
    const debts = await prisma.simplifiedDebt.findMany({
      where: {
        status: { in: statusOptions.statuses },
        OR: [{ debtor: { userId } }, { creditor: { userId } }],
      },
      select: {
        amountCents: true,
        status: true,
        eventId: true,
        debtor: {
          select: {
            id: true,
            userId: true,
            username: true,
            user: { select: { name: true } },
          },
        },
        creditor: {
          select: {
            id: true,
            userId: true,
            username: true,
            user: { select: { name: true } },
          },
        },
        event: { select: { name: true } },
      },
    });

    return debts.map((debt) => ({
      debtor: {
        participantId: debt.debtor.id,
        userId: debt.debtor.userId,
        participantUsername: debt.debtor.username,
        userName: debt.debtor.user?.name ?? null,
      },
      creditor: {
        participantId: debt.creditor.id,
        userId: debt.creditor.userId,
        participantUsername: debt.creditor.username,
        userName: debt.creditor.user?.name ?? null,
      },
      amountCents: debt.amountCents,
      status: debt.status,
      eventId: debt.eventId,
      eventName: debt.event.name,
    }));
  },

  async replacePendingForEvent(eventId: string, debts: SimplifiedDebt[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.simplifiedDebt.deleteMany({
        where: { eventId, status: "pending" },
      });

      if (debts.length > 0) {
        await tx.simplifiedDebt.createMany({
          data: debts.map((debt) => ({
            eventId,
            debtorParticipantId: debt.debtorParticipantId,
            creditorParticipantId: debt.creditorParticipantId,
            amountCents: debt.amountCents,
            status: "pending",
          })),
        });
      }
    });
  },

  async withinTransaction(operation) {
    // Prisma abre la transacción y entrega `tx`, un cliente asociado a ella. Las
    // operaciones entregadas al callback usan ese mismo cliente, por lo que se
    // confirman juntas o se revierten juntas si alguna falla.
    return prisma.$transaction((tx) => operation(createDebtSettlementTransaction(tx)));
  },
};
