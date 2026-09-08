import { describe, expect, it } from "vitest";
import { toParticipantResponseDTO } from "../../src/dtos/participant/participant.response.dto.js";

describe("toParticipantResponseDTO", () => {
  it("incluye el estado de asistencia y excluye datos internos", () => {
    const response = toParticipantResponseDTO({
      id: "participant-1",
      eventId: "event-1",
      userId: "user-1",
      username: "Gil",
      isAnonymous: false,
      isOrganizer: false,
      attendanceState: "confirmed",
    });

    expect(response).toEqual({
      id: "participant-1",
      eventId: "event-1",
      username: "Gil",
      isAnonymous: false,
      isOrganizer: false,
      attendanceState: "confirmed",
    });
    expect(response).not.toHaveProperty("userId");
    expect(response).not.toHaveProperty("pinHash");
  });
});
