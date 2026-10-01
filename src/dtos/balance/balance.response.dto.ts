import type {
  EventBalanceLine,
  PersonBalance,
  PersonBalanceDetail,
  UserBalanceSummary,
} from "../../types/balance.js";

export interface BalanceResponseDTO {
  owedToMeCents: number;
  iOweCents: number;
}

export interface EventBalanceLineResponseDTO {
  eventId: string;
  eventName: string;
  amountCents: number;
  direction: EventBalanceLine["direction"];
}

export interface PersonBalanceResponseDTO {
  personKey: string;
  displayName: string;
  status: PersonBalance["status"];
  netCents: number;
}

export interface PersonBalanceDetailResponseDTO extends PersonBalanceResponseDTO {
  breakdown: EventBalanceLineResponseDTO[];
}

export function toBalanceResponseDTO(summary: UserBalanceSummary): BalanceResponseDTO {
  return {
    owedToMeCents: summary.owedToMeCents,
    iOweCents: summary.iOweCents,
  };
}

export function toPersonBalanceResponseDTO(balance: PersonBalance): PersonBalanceResponseDTO {
  return {
    personKey: balance.personKey,
    displayName: balance.displayName,
    status: balance.status,
    netCents: balance.netCents,
  };
}

function toEventBalanceLineResponseDTO(line: EventBalanceLine): EventBalanceLineResponseDTO {
  return {
    eventId: line.eventId,
    eventName: line.eventName,
    amountCents: line.amountCents,
    direction: line.direction,
  };
}

export function toPersonBalanceDetailResponseDTO(
  balance: PersonBalanceDetail,
): PersonBalanceDetailResponseDTO {
  return {
    ...toPersonBalanceResponseDTO(balance),
    breakdown: balance.breakdown.map(toEventBalanceLineResponseDTO),
  };
}
