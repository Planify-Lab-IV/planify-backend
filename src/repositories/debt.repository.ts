import { prisma } from "../infrastructure/prisma.js";
import type { SimplifiedDebt } from "../services/debt-simplification.service.js";

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

export interface DebtRepository {
  findByEventId(eventId: string): Promise<SimplifiedDebtRecord[]>;
  findSettledByEventId(eventId: string): Promise<SimplifiedDebtRecord[]>;
  replacePendingForEvent(eventId: string, debts: SimplifiedDebt[]): Promise<void>;
}

export const debtRepository: DebtRepository = {
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
