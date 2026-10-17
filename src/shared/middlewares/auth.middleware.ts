// Lee el token de autorizacion, lo verifica y si es valido deja disponible el id del usuario en la req o 401

import type { NextFunction, Request, Response } from "express";
import type { SessionTokenService } from "../../infrastructure/security/session.token.service.js";
import type { UserRepository } from "../../repositories/user.repository.js";
import { UnauthorizedError } from "../errors/index.js";
import { validateUserSession } from "../auth/user.session.validator.js";

// --> Se le inyecta el servicio de tokens
export function createAuthMiddleware(
  sessionTokenService: SessionTokenService,
  userRepository: UserRepository,
) {
  return async function requireAuthenticatedUser(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization; // --> Bearer <token> (portado por cualquiera que lo tenga)

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new UnauthorizedError("Token de autenticación ausente"));
    }

    const token = authHeader.slice("Bearer ".length); // --> Slicea bearer

    try {
      req.userId = await validateUserSession(token, sessionTokenService, userRepository);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
