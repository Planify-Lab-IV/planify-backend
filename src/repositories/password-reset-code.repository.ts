import { prisma } from "../infrastructure/prisma.js";

export interface PasswordResetCodeRepository {
  create(data: { userId: string; codeHash: string; expiresAt: Date }): Promise<void>;
  countCreatedSince(userId: string, since: Date): Promise<number>;
  invalidateActiveForUser(userId: string, now: Date): Promise<void>;
  reserveAttempt(
    userId: string,
    now: Date,
    maxAttempts: number,
  ): Promise<{ id: string; codeHash: string } | null>;
  markUsed(id: string, now: Date): Promise<boolean>;
}

export function createPasswordResetCodeRepository(): PasswordResetCodeRepository {
  return {
    async create({ userId, codeHash, expiresAt }): Promise<void> {
      await prisma.passwordResetCode.create({ data: { userId, codeHash, expiresAt } });
    },

    async countCreatedSince(userId, since): Promise<number> {
      return prisma.passwordResetCode.count({ where: { userId, createdAt: { gte: since } } });
    },

    async invalidateActiveForUser(userId, now): Promise<void> {
      await prisma.passwordResetCode.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
    },

    async reserveAttempt(userId, now, maxAttempts) {
      const [code] = await prisma.passwordResetCode.updateManyAndReturn({
        where: {
          userId,
          usedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: maxAttempts },
        },
        data: { attempts: { increment: 1 } },
        select: { id: true, codeHash: true },
      });

      return code ?? null;
    },

    async markUsed(id, now): Promise<boolean> {
      const result = await prisma.passwordResetCode.updateMany({
        where: { id, usedAt: null },
        data: { usedAt: now },
      });

      return result.count === 1;
    },
  };
}

export const passwordResetCodeRepository = createPasswordResetCodeRepository();
