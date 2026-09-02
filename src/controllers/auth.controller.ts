// Capa HTTP de autenticación: extrae parámetros, invoca AuthService y formatea la respuesta.

import type { Request, Response, NextFunction } from "express";
import type { AuthService } from "../services/auth.service.js";

export interface AuthController {
  login(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createAuthController(authService: AuthService): AuthController {
  return {
    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const { identifier, password } = req.body ?? {}; // --> Prevencion de que no sea null o invalido

        // --> Se delega el login al service
        const result = await authService.login({
          identifier,
          password,
        });

        // --> Si la respuesta es exitosa, devuelvo 200 y pasa el authResult a json, sino lanza error
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  };
}
