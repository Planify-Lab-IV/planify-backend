import type { Expense } from "../../repositories/expense.repository.js";

export interface ExpenseShareResponseDTO {
  participantId: string;
  amountCents: number;
}

export interface ExpenseResponseDTO {
  id: string;
  eventId: string;
  description: string;
  totalAmountCents: number;
  createdByParticipantId: string;
  createdAt: Date;
  payers: ExpenseShareResponseDTO[];
  debtors: ExpenseShareResponseDTO[];
}

function toExpenseShareResponseDTO({
  participantId,
  amountCents,
}: Expense["payers"][number]): ExpenseShareResponseDTO {
  return { participantId, amountCents };
}

export function toExpenseResponseDTO(expense: Expense): ExpenseResponseDTO {
  return {
    id: expense.id,
    eventId: expense.eventId,
    description: expense.description,
    totalAmountCents: expense.totalAmountCents,
    createdByParticipantId: expense.createdByParticipantId,
    createdAt: expense.createdAt,
    payers: expense.payers.map(toExpenseShareResponseDTO),
    debtors: expense.debtors.map(toExpenseShareResponseDTO),
  };
}
