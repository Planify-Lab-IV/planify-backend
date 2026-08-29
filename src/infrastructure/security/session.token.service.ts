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

    verify(token) {
      const payload = jwt.verify(token, secret) as jwt.JwtPayload;
      return String(payload.sub);
    },
  };
}
