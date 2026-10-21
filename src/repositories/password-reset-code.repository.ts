import { prisma } from "../infrastructure/prisma.js";

export interface PasswordResetCodeRepository {
  createReplacingActiveIfAllowed(data: {
    userId: string;
    codeHash: string;
    expiresAt: Date;
    now: Date;
    requestWindowStart: Date;
    maxRequests: number;
  }): Promise<boolean>;
  reserveAttempt(
    userId: string,
    now: Date,
    maxAttempts: number,
  ): Promise<{ id: string; codeHash: string } | null>;
  markUsed(id: string, now: Date): Promise<boolean>;
}

export function createPasswordResetCodeRepository(): PasswordResetCodeRepository {
  return {
    async createReplacingActiveIfAllowed({
      userId,
      codeHash,
      expiresAt,
      now,
      requestWindowStart,
      maxRequests,
    }): Promise<boolean> {
      return prisma.$transaction(async (tx) => {
        const lockedUsers = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "usuario"
          WHERE "id" = ${userId}
          FOR UPDATE
        `;
        if (lockedUsers.length === 0) return false;

        const requestCount = await tx.passwordResetCode.count({
          where: { userId, createdAt: { gte: requestWindowStart } },
        });
        if (requestCount >= maxRequests) return false;

        await tx.passwordResetCode.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.passwordResetCode.create({ data: { userId, codeHash, expiresAt } });

        return true;
      });
    },

    async reserveAttempt(userId, now, maxAttempts) {
      return prisma.$transaction(async (tx) => {
        const code = await tx.passwordResetCode.findFirst({
          where: {
            userId,
            usedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: maxAttempts },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, codeHash: true },
        });
        if (!code) return null;

        const result = await tx.passwordResetCode.updateMany({
          where: {
            id: code.id,
            usedAt: null,
            expiresAt: { gt: now },
            attempts: { lt: maxAttempts },
          },
          data: { attempts: { increment: 1 } },
        });

        return result.count === 1 ? code : null;
      });
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
