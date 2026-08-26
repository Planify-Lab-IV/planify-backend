// La unica capa que se comunica con prisma

import { prisma } from "../infrastructure/prisma.js";

export interface HealthRepository {
  check(): Promise<void>;
}

export const healthRepository: HealthRepository = {
  async check(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`; // --> Ejecuta la DB
  },
};
