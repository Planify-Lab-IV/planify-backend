import { prisma } from "./prisma.js";
import { createUserRepository } from "../repositories/user.repository.js";
import type { ProfileUpdateCoordinator } from "../services/profile.service.js";

export function createPostgresProfileUpdateCoordinator(): ProfileUpdateCoordinator {
  return {
    async runExclusive<T>(
      userId: string,
      operation: (userRepository: ReturnType<typeof createUserRepository>) => Promise<T>,
    ): Promise<T> {
      return prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

        return operation(createUserRepository(transaction));
      });
    },
  };
}
