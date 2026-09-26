import { prisma } from "../infrastructure/prisma.js";

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

export interface SimplifiedDebtInput {
  debtorParticipantId: string;
  creditorParticipantId: string;
  amountCents: number;
}

export interface DebtRepository {
  findByEventId(eventId: string): Promise<SimplifiedDebtRecord[]>;
  findSettledByEventId(eventId: string): Promise<SimplifiedDebtRecord[]>;
  replacePendingForEvent(eventId: string, debts: SimplifiedDebtInput[]): Promise<void>;
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

  async replacePendingForEvent(eventId: string, debts: SimplifiedDebtInput[]): Promise<void> {
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
