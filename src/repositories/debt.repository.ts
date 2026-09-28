import { prisma } from "../infrastructure/prisma.js";
import type { SimplifiedDebt } from "../services/debt-simplification.service.js";

export type DebtStatus = "pending" | "settled";

export interface SimplifiedDebtRecord {
  id: string;
  eventId: string;
  debtorParticipantId: string;
  creditorParticipantId: string;
  amountCents: number;
  status: DebtStatus;
  settledAt: Date | null;
  createdAt: Date;
}

export interface FindByUserIdOptions {
  statuses: DebtStatus[];
}

export interface DebtParticipantForUserRecord {
  participantId: string;
  userId: string | null;
  participantUsername: string;
  username: string | null;
}

export interface DebtForUserRecord {
  debtor: DebtParticipantForUserRecord;
  creditor: DebtParticipantForUserRecord;
  amountCents: number;
  status: DebtStatus;
  eventId: string;
  eventName: string;
}

export interface DebtRepository {
  findByEventId(eventId: string): Promise<SimplifiedDebtRecord[]>;
  findSettledByEventId(eventId: string): Promise<SimplifiedDebtRecord[]>;
  findByUserId(userId: string, statusOptions: FindByUserIdOptions): Promise<DebtForUserRecord[]>;
  replacePendingForEvent(eventId: string, debts: SimplifiedDebt[]): Promise<void>;
}

export const debtRepository: DebtRepository = {
  async findByEventId(eventId: string): Promise<SimplifiedDebtRecord[]> {
    return prisma.simplifiedDebt.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
    });
  },

  async findSettledByEventId(eventId: string): Promise<SimplifiedDebtRecord[]> {
    return prisma.simplifiedDebt.findMany({
      where: { eventId, status: "settled" },
      orderBy: { createdAt: "asc" },
    });
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
        username: debt.debtor.user?.name ?? null,
      },
      creditor: {
        participantId: debt.creditor.id,
        userId: debt.creditor.userId,
        participantUsername: debt.creditor.username,
        username: debt.creditor.user?.name ?? null,
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
};
