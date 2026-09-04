// Emite y verifica tokens de sesion JWT

import jwt from "jsonwebtoken";

export interface ParticipantSession {
  participantId: string;
  eventId: string;
}

export interface SessionTokenService {
  sign(userId: string): string; // --> Crea token firmado con ese usuario
  verify(token: string): string; // --> Valida token

  signParticipant(participantId: string, eventId: string): string;
  verifyParticipant(token: string): ParticipantSession;
}

// --> Se inyecta el secret
export function createSessionTokenService(secret: string): SessionTokenService {
  const EXPIRES_IN = "7d"; // --> Lo que dura la sesion, podria ser configurable

  return {
    sign(userId) {
      return jwt.sign({ sub: userId }, secret, { expiresIn: EXPIRES_IN });
    },

    verify(token: string): string {
      const payload = jwt.verify(token, secret);
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("sub" in payload) ||
        typeof payload.sub !== "string" || // --> Verifica tanto que payload sea un objeto valido como que el token sea de caracter sub
        payload.sub.trim() === ""
      ) {
        throw new Error("Token payload inválido: falta el claim sub");
      }
      return payload.sub;
    },

    signParticipant(participantId, eventId) {
      return jwt.sign(
        {
          sub: participantId,
          eventId,
          sessionType: "participant", // -> Para que no se interprete erroneamente
        },
        secret,
        { expiresIn: EXPIRES_IN },
      );
    },

    verifyParticipant(token) {
      const payload = jwt.verify(token, secret);

      if (
        typeof payload !== "object" ||
        payload === null ||
        payload.sessionType !== "participant" ||
        typeof payload.sub !== "string" ||
        payload.sub.trim() === "" ||
        typeof payload.eventId !== "string" ||
        payload.eventId.trim() === ""
      ) {
        throw new Error("Token de participante inválido");
      }

      return {
        participantId: payload.sub,
        eventId: payload.eventId,
      };
    },
  };
}
