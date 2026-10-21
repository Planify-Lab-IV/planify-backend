import type { FriendshipStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../infrastructure/prisma.js";
import type { PublicUser } from "./user.repository.js";

type FriendshipRepositoryClient = PrismaClient | Prisma.TransactionClient;

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: Date;
}

export interface FriendshipWithUsers extends Friendship {
  requester: PublicUser;
  addressee: PublicUser;
}

export interface FriendshipRepository {
  findByPair(userIdA: string, userIdB: string): Promise<Friendship | null>;
  create(data: { requesterId: string; addresseeId: string }): Promise<Friendship>;
  acceptPending(id: string, addresseeId: string): Promise<boolean>;
  deletePending(id: string, userId: string): Promise<boolean>;
  listAcceptedForUser(userId: string): Promise<FriendshipWithUsers[]>;
  listPendingReceived(userId: string): Promise<FriendshipWithUsers[]>;
  listPendingSent(userId: string): Promise<FriendshipWithUsers[]>;
  listRelationsForUser(userId: string, otherUserIds: string[]): Promise<Friendship[]>;
}

export function friendshipPairKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(":");
}

const publicUserSelect = { id: true, name: true, username: true } as const;

export function createFriendshipRepository(
  client: FriendshipRepositoryClient,
): FriendshipRepository {
  return {
    async findByPair(userIdA, userIdB) {
      return client.friendship.findUnique({
        where: { pairKey: friendshipPairKey(userIdA, userIdB) },
      });
    },

    async create({ requesterId, addresseeId }) {
      return client.friendship.create({
        data: {
          requesterId,
          addresseeId,
          pairKey: friendshipPairKey(requesterId, addresseeId),
        },
      });
    },

    async acceptPending(id, addresseeId) {
      const result = await client.friendship.updateMany({
        where: { id, addresseeId, status: "pending" },
        data: { status: "accepted" },
      });
      return result.count > 0;
    },

    async deletePending(id, userId) {
      const result = await client.friendship.deleteMany({
        where: {
          id,
          status: "pending",
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
      });
      return result.count > 0;
    },

    async listAcceptedForUser(userId) {
      return client.friendship.findMany({
        where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
        include: {
          requester: { select: publicUserSelect },
          addressee: { select: publicUserSelect },
        },
        orderBy: { createdAt: "asc" },
      });
    },

    async listPendingReceived(userId) {
      return client.friendship.findMany({
        where: { status: "pending", addresseeId: userId },
        include: {
          requester: { select: publicUserSelect },
          addressee: { select: publicUserSelect },
        },
        orderBy: { createdAt: "asc" },
      });
    },

    async listPendingSent(userId) {
      return client.friendship.findMany({
        where: { status: "pending", requesterId: userId },
        include: {
          requester: { select: publicUserSelect },
          addressee: { select: publicUserSelect },
        },
        orderBy: { createdAt: "asc" },
      });
    },

    async listRelationsForUser(userId, otherUserIds) {
      if (otherUserIds.length === 0) return [];

      return client.friendship.findMany({
        where: {
          OR: [
            { requesterId: userId, addresseeId: { in: otherUserIds } },
            { addresseeId: userId, requesterId: { in: otherUserIds } },
          ],
        },
      });
    },
  };
}

export const friendshipRepository = createFriendshipRepository(prisma);
