export interface UserBalanceSummary {
  owedToMeCents: number;
  iOweCents: number;
}

export type PersonBalanceStatus = "pay" | "pending" | "settled";

export type BalanceDirection = "i_owe" | "owed_to_me";

export type PersonKey = `user:${string}` | `participant:${string}`;

export type ParsedPersonKey =
  { type: "user"; userId: string } | { type: "participant"; participantId: string };

const personKeyPattern = /^(user|participant):([^:\s]+)$/;

export function parsePersonKey(value: string): ParsedPersonKey | null {
  const match = personKeyPattern.exec(value);

  if (!match) {
    return null;
  }

  const [, type, id] = match;

  if (type === "user" && id) {
    return { type, userId: id };
  }

  if (type === "participant" && id) {
    return { type, participantId: id };
  }

  return null;
}

export function isPersonKey(value: string): value is PersonKey {
  return parsePersonKey(value) !== null;
}

export interface EventBalanceLine {
  eventId: string;
  eventName: string;
  amountCents: number;
  direction: BalanceDirection;
}

export interface PersonBalance {
  personKey: PersonKey;
  displayName: string;
  status: PersonBalanceStatus;
  netCents: number;
}

export interface PersonBalanceDetail extends PersonBalance {
  breakdown: EventBalanceLine[];
}
