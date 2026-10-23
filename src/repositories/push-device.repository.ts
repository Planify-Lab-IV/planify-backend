import { prisma } from "../infrastructure/prisma.js";

export interface PushDeviceRepository {
  upsertByToken(data: { userId: string; token: string }): Promise<void>;
  deleteByToken(token: string, userId: string): Promise<boolean>;
  deleteByTokens(tokens: readonly string[]): Promise<void>;
  findByEventRecipients(eventId: string, excludeParticipantId: string): Promise<string[]>;
}

export const pushDeviceRepository: PushDeviceRepository = {
  async upsertByToken({ userId, token }) {
    await prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token },
      update: { userId },
    });
  },

  async deleteByToken(token, userId) {
    const result = await prisma.pushDevice.deleteMany({
      where: { token, userId },
    });

    return result.count > 0;
  },

  async deleteByTokens(tokens) {
    if (tokens.length === 0) {
      return;
    }

    await prisma.pushDevice.deleteMany({
      where: { token: { in: [...tokens] } },
    });
  },

  async findByEventRecipients(eventId, excludeParticipantId) {
    const devices = await prisma.pushDevice.findMany({
      where: {
        user: {
          eventParticipations: {
            some: {
              eventId,
              id: { not: excludeParticipantId },
            },
          },
        },
      },
      select: { token: true },
    });

    return devices.map((device) => device.token);
  },
};
