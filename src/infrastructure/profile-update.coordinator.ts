import { prisma } from "./prisma.js";
import type { ProfileUpdateCoordinator } from "../services/profile.service.js";

const lockTimeoutMilliseconds = 30_000;

export function createPostgresProfileUpdateCoordinator(): ProfileUpdateCoordinator {
  return {
    async runExclusive<T>(userId: string, operation: () => Promise<T>): Promise<T> {
      return prisma.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

          return operation();
        },
        {
          maxWait: lockTimeoutMilliseconds,
          timeout: lockTimeoutMilliseconds,
        },
      );
    },
  };
}
