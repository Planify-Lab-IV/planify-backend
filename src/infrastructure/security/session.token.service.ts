// Emite y verifica tokens de sesion JWT

import jwt from "jsonwebtoken";

export interface SessionTokenService {
  sign(usuarioId: string): string; // --> Crea token firmado con ese usuario
  verify(token: string): string; // --> Valida token
}

// --> Se inyecta el secret
export function createSessionTokenService(secret: string): SessionTokenService {
  const EXPIRES_IN = "7d"; // --> Lo que dura la sesion, podria ser configurable

  return {
    sign(usuarioId) {
      return jwt.sign({ sub: usuarioId }, secret, { expiresIn: EXPIRES_IN });
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
  };
}
