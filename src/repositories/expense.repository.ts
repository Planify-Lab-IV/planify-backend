import { prisma } from "../infrastructure/prisma.js";

export interface ExpenseShare {
  expenseId: string;
  participantId: string;
  amountCents: number;
}

export interface Expense {
  id: string;
  eventId: string;
  description: string;
  totalAmountCents: number;
  createdByParticipantId: string;
  createdAt: Date;
  payers: ExpenseShare[];
  debtors: ExpenseShare[];
}

export interface ExpenseShareInput {
  participantId: string;
  amountCents: number;
}

export interface CreateExpenseParams {
  eventId: string;
  description: string;
  totalAmountCents: number;
  createdByParticipantId: string;
  payers: ExpenseShareInput[];
  debtors: ExpenseShareInput[];
}

export interface ExpenseRepository {
  createAtomic(params: CreateExpenseParams): Promise<Expense>;
}

export const expenseRepository: ExpenseRepository = {
  async createAtomic(params: CreateExpenseParams): Promise<Expense> {
    return prisma.$transaction(async (tx) => {
      return tx.expense.create({
        data: {
          eventId: params.eventId,
          description: params.description,
          totalAmountCents: params.totalAmountCents,
          createdByParticipantId: params.createdByParticipantId,
          payers: {
            create: params.payers.map((payer) => ({
              participantId: payer.participantId,
              amountCents: payer.amountCents,
            })),
          },
          debtors: {
            create: params.debtors.map((debtor) => ({
              participantId: debtor.participantId,
              amountCents: debtor.amountCents,
            })),
          },
        },
        include: {
          payers: true,
          debtors: true,
        },
      });
    });
  },
};
