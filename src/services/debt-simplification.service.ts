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

function compareParticipantIds(left: ParticipantNetBalance, right: ParticipantNetBalance): number {
  if (left.participantId < right.participantId) return -1;
  if (left.participantId > right.participantId) return 1;
  return 0;
}

function compareCreditors(left: ParticipantNetBalance, right: ParticipantNetBalance): number {
  return right.netCents - left.netCents || compareParticipantIds(left, right);
}

function compareDebtors(left: ParticipantNetBalance, right: ParticipantNetBalance): number {
  return left.netCents - right.netCents || compareParticipantIds(left, right);
}

export function simplifyDebts(entries: ParticipantAmountCents[]): SimplifiedDebt[] {
  const balances = calculateNetBalances(entries);
  const creditors = balances.filter((balance) => balance.netCents > 0);
  const debtors = balances.filter((balance) => balance.netCents < 0);
  const simplifiedDebts: SimplifiedDebt[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(compareCreditors);
    debtors.sort(compareDebtors);

    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amountCents = Math.min(creditor.netCents, Math.abs(debtor.netCents));

    simplifiedDebts.push({
      debtorParticipantId: debtor.participantId,
      creditorParticipantId: creditor.participantId,
      amountCents,
    });

    creditor.netCents -= amountCents;
    debtor.netCents += amountCents;

    if (creditor.netCents === 0) {
      creditors.shift();
    }
    if (debtor.netCents === 0) {
      debtors.shift();
    }
  }

  if (creditors.length > 0 || debtors.length > 0) {
    throw new Error("No se pudieron saldar todos los balances netos");
  }

  return simplifiedDebts;
}
