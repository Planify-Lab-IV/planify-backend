import { describe, expect, it } from "vitest";
import {
  toPersonBalanceDetailResponseDTO,
  toPersonBalanceResponseDTO,
} from "../../src/dtos/balance/balance.response.dto.js";

describe("balance response DTOs", () => {
  it("serializa una persona con su saldo neto", () => {
    expect(
      toPersonBalanceResponseDTO({
        personKey: "user:user-marcos",
        displayName: "Marcos",
        status: "pay",
        netCents: -200,
      }),
    ).toEqual({
      personKey: "user:user-marcos",
      displayName: "Marcos",
      status: "pay",
      netCents: -200,
    });
  });

  it("serializa el detalle con las líneas por evento", () => {
    expect(
      toPersonBalanceDetailResponseDTO({
        personKey: "user:user-marcos",
        displayName: "Marcos",
        status: "pay",
        netCents: -200,
        breakdown: [
          {
            eventId: "event-asado",
            eventName: "Asado",
            amountCents: 500,
            direction: "i_owe",
          },
        ],
      }),
    ).toEqual({
      personKey: "user:user-marcos",
      displayName: "Marcos",
      status: "pay",
      netCents: -200,
      breakdown: [
        {
          eventId: "event-asado",
          eventName: "Asado",
          amountCents: 500,
          direction: "i_owe",
        },
      ],
    });
  });
});
