export interface UserBalanceSummary {
  owedToMeCents: number;
  iOweCents: number;
}

export type PersonBalanceStatus = "pay" | "pending" | "settled";

export type BalanceDirection = "i_owe" | "owed_to_me";

export type PersonKey = `user:${string}` | `participant:${string}`;

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
