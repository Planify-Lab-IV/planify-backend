import { describe, expect, it } from "vitest";
import {
  simplifyDebts,
  type ParticipantAmountCents,
  type SimplifiedDebt,
} from "../src/services/debt-simplification.service.js";

function makeEntry(
  participantId: string,
  contributedCents: number,
  owedCents: number,
): ParticipantAmountCents {
  return { participantId, contributedCents, owedCents };
}

function expectBalancesToBeSettled(
  entries: ParticipantAmountCents[],
  simplifiedDebts: SimplifiedDebt[],
): void {
  const balances = new Map(
    entries.map((entry) => [entry.participantId, entry.contributedCents - entry.owedCents]),
  );

  for (const debt of simplifiedDebts) {
    expect(debt.amountCents).toBeGreaterThan(0);

    balances.set(
      debt.debtorParticipantId,
      (balances.get(debt.debtorParticipantId) ?? 0) + debt.amountCents,
    );
    balances.set(
      debt.creditorParticipantId,
      (balances.get(debt.creditorParticipantId) ?? 0) - debt.amountCents,
    );
  }

  expect([...balances.values()].every((balance) => balance === 0)).toBe(true);
}

describe("simplifyDebts", () => {
  it("genera una sola transacciÃ³n para dos participantes con saldos opuestos", () => {
    const entries = [makeEntry("ana", 5000, 0), makeEntry("beto", 0, 5000)];

    expect(simplifyDebts(entries)).toEqual([
      {
        debtorParticipantId: "beto",
        creditorParticipantId: "ana",
        amountCents: 5000,
      },
    ]);
  });

  it("liquida a un deudor frente a dos acreedores en como mÃ¡ximo dos transacciones", () => {
    const entries = [
      makeEntry("ana", 600, 0),
      makeEntry("beto", 400, 0),
      makeEntry("cami", 0, 1000),
    ];

    const simplifiedDebts = simplifyDebts(entries);

    expect(simplifiedDebts).toHaveLength(2);
    expectBalancesToBeSettled(entries, simplifiedDebts);
  });

  it("conserva todos los centavos con cinco participantes y montos no divisibles", () => {
    const entries = [
      makeEntry("ana", 10000, 3334),
      makeEntry("beto", 0, 3333),
      makeEntry("cami", 0, 3333),
      makeEntry("dani", 1000, 500),
      makeEntry("ema", 0, 500),
    ];

    const simplifiedDebts = simplifyDebts(entries);

    expect(simplifiedDebts).toHaveLength(3);
    expect(simplifiedDebts.reduce((total, debt) => total + debt.amountCents, 0)).toBe(7166);
    expectBalancesToBeSettled(entries, simplifiedDebts);
  });

  it("no genera transacciones cuando todos los participantes ya estÃ¡n a mano", () => {
    const entries = [makeEntry("ana", 5000, 5000), makeEntry("beto", 3333, 3333)];

    expect(simplifyDebts(entries)).toEqual([]);
  });

  it("produce el mismo resultado sin importar el orden de entrada y desempata por ID", () => {
    const entries = [
      makeEntry("dani", 0, 500),
      makeEntry("beto", 500, 0),
      makeEntry("cami", 0, 500),
      makeEntry("ana", 500, 0),
    ];
    const reorderedEntries = [entries[3]!, entries[2]!, entries[1]!, entries[0]!];
    const expectedDebts = [
      {
        debtorParticipantId: "cami",
        creditorParticipantId: "ana",
        amountCents: 500,
      },
      {
        debtorParticipantId: "dani",
        creditorParticipantId: "beto",
        amountCents: 500,
      },
    ];

    expect(simplifyDebts(entries)).toEqual(expectedDebts);
    expect(simplifyDebts(reorderedEntries)).toEqual(expectedDebts);
  });

  it("falla cuando los balances de entrada no suman cero", () => {
    const entries = [makeEntry("ana", 500, 0), makeEntry("beto", 0, 400)];

    expect(() => simplifyDebts(entries)).toThrow("La suma de los balances netos debe ser cero");
  });
});
