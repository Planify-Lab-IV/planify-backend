import type { SimplifiedDebtRecord } from "../../repositories/debt.repository.js";

export interface EventDebtParticipantResponseDTO {
  participantId: string;
  username: string;
}

export interface EventDebtResponseDTO {
  id: string;
  eventId: string;
  debtor: EventDebtParticipantResponseDTO;
  creditor: EventDebtParticipantResponseDTO;
  amountCents: number;
  status: "pending" | "settled";
  settledAt: Date | null;
}

export interface EventDebtsResponseDTO {
  debts: EventDebtResponseDTO[];
  allSettled: boolean;
}

function toEventDebtParticipantResponseDTO(
  participant: SimplifiedDebtRecord["debtor"],
): EventDebtParticipantResponseDTO {
  return {
    participantId: participant.id,
    username: participant.username,
  };
}

export function toEventDebtResponseDTO(debt: SimplifiedDebtRecord): EventDebtResponseDTO {
  return {
    id: debt.id,
    eventId: debt.eventId,
    debtor: toEventDebtParticipantResponseDTO(debt.debtor),
    creditor: toEventDebtParticipantResponseDTO(debt.creditor),
    amountCents: debt.amountCents,
    status: debt.status,
    settledAt: debt.settledAt,
  };
}

export function toEventDebtsResponseDTO(
  debts: SimplifiedDebtRecord[],
  allSettled: boolean,
): EventDebtsResponseDTO {
  return {
    debts: debts.map(toEventDebtResponseDTO),
    allSettled,
  };
}
