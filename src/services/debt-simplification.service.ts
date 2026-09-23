export interface ParticipantAmountCents {
  participantId: string;
  contributedCents: number;
  owedCents: number;
}

export interface SimplifiedDebt {
  debtorParticipantId: string;
  creditorParticipantId: string;
  amountCents: number;
}

export interface ParticipantNetBalance {
  participantId: string;
  netCents: number;
}

export function calculateNetBalances(entries: ParticipantAmountCents[]): ParticipantNetBalance[] {
  const balances = entries.map(({ participantId, contributedCents, owedCents }) => ({
    participantId,
    netCents: contributedCents - owedCents,
  }));

  const totalNetCents = balances.reduce((total, { netCents }) => total + netCents, 0);

  if (totalNetCents !== 0) {
    throw new Error("La suma de los balances netos debe ser cero");
  }

  return balances;
}
