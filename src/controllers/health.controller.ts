// Capa HTTP que conoce express y las req/res. Extrae datos de la req, llama al service y manda res

import type { Request, Response, NextFunction } from "express";
import type { HealthService } from "../services/health.service.js";

export interface HealthController {
  check(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createHealthController(service: HealthService): HealthController {
  return {
    async check(_req, res, next) {
      try {
        const result = await service.check();
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  };
}
