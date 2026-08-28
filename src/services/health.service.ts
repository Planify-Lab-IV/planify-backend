// Logica de negocio, decide que hacer si la DB falla. Solo recibe datos y retorna datos

import type { HealthRepository } from "../repositories/health.repository.js";
import { AppError } from "../shared/errors/index.js";

export interface HealthService {
  check(): Promise<{ status: string; database: string }>;
}

export function createHealthService(repository: HealthRepository): HealthService {
  return {
    async check() {
      try {
        await repository.check();
        return { status: "ok", database: "connected" };
      } catch {
        throw new AppError("Database connection failed", 503);
      }
    },
  };
}
