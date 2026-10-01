import type { UserBalanceSummary } from "../../services/debt.service.js";

export interface BalanceResponseDTO {
  owedToMeCents: number;
  iOweCents: number;
}

export function toBalanceResponseDTO(summary: UserBalanceSummary): BalanceResponseDTO {
  return {
    owedToMeCents: summary.owedToMeCents,
    iOweCents: summary.iOweCents,
  };
}
