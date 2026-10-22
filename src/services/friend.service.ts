import type { Friendship, FriendshipRepository } from "../repositories/friendship.repository.js";
import type { PublicUser, UserRepository } from "../repositories/user.repository.js";
import {
  FriendRequestNotFoundError,
  FriendshipAlreadyExistsError,
  NotFoundError,
  ValidationError,
} from "../shared/errors/index.js";

export type FriendshipRelationship = "none" | "request_sent" | "request_received";

export interface FriendSearchResult extends PublicUser {
  relationship: FriendshipRelationship;
  requestId: string | null;
}

export interface FriendRequest {
  id: string;
  user: PublicUser;
  createdAt: Date;
}

export interface FriendService {
  search(userId: string, query: unknown): Promise<FriendSearchResult[]>;
  sendRequest(requesterId: string, addresseeId: string): Promise<FriendRequest>;
  listRequests(userId: string): Promise<{ received: FriendRequest[]; sent: FriendRequest[] }>;
  accept(userId: string, friendshipId: string): Promise<void>;
  removeRequest(userId: string, friendshipId: string): Promise<void>;
  listFriends(userId: string): Promise<PublicUser[]>;
  areFriends(userIdA: string, userIdB: string): Promise<boolean>;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function toPublicUser(user: { id: string; name: string; username: string }): PublicUser {
  return { id: user.id, name: user.name, username: user.username };
}

function cleanSearchQuery(query: unknown): string {
  if (typeof query !== "string" || query.trim().length < 2) {
    throw new ValidationError("La búsqueda debe tener al menos 2 caracteres");
  }

  return query.trim();
}

function relationshipFor(
  userId: string,
  candidateId: string,
  relations: Friendship[],
): { relationship: FriendshipRelationship; requestId: string | null } {
  const relation = relations.find(
    (candidate) =>
      (candidate.requesterId === userId && candidate.addresseeId === candidateId) ||
      (candidate.addresseeId === userId && candidate.requesterId === candidateId),
  );

  if (!relation) return { relationship: "none", requestId: null };
  if (relation.status === "accepted") return { relationship: "none", requestId: null };

  return relation.requesterId === userId
    ? { relationship: "request_sent", requestId: relation.id }
    : { relationship: "request_received", requestId: relation.id };
}

export function createFriendService(
  friendshipRepository: FriendshipRepository,
  userRepository: UserRepository,
): FriendService {
  return {
    async search(userId, query) {
      const cleanQuery = cleanSearchQuery(query);
      const users = await userRepository.searchByUsername(cleanQuery, {
        excludeUserId: userId,
        limit: 20,
      });
      const relations = await friendshipRepository.listRelationsForUser(
        userId,
        users.map((user) => user.id),
      );

      return users.flatMap((user) => {
        const relation = relationshipFor(userId, user.id, relations);
        return relations.some(
          (candidate) =>
            candidate.status === "accepted" &&
            ((candidate.requesterId === userId && candidate.addresseeId === user.id) ||
              (candidate.addresseeId === userId && candidate.requesterId === user.id)),
        )
          ? []
          : [{ ...user, ...relation }];
      });
    },

    async sendRequest(requesterId, addresseeId) {
      if (requesterId === addresseeId) {
        throw new ValidationError("No podés enviarte una solicitud de amistad");
      }

      const addressee = await userRepository.findById(addresseeId);
      if (!addressee) throw new NotFoundError("Usuario no encontrado");

      if (await friendshipRepository.findByPair(requesterId, addresseeId)) {
        throw new FriendshipAlreadyExistsError();
      }

      try {
        const friendship = await friendshipRepository.create({ requesterId, addresseeId });
        return {
          id: friendship.id,
          user: toPublicUser(addressee),
          createdAt: friendship.createdAt,
        };
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new FriendshipAlreadyExistsError();
        throw error;
      }
    },

    async listRequests(userId) {
      const [received, sent] = await Promise.all([
        friendshipRepository.listPendingReceived(userId),
        friendshipRepository.listPendingSent(userId),
      ]);

      return {
        received: received.map((request) => ({
          id: request.id,
          user: request.requester,
          createdAt: request.createdAt,
        })),
        sent: sent.map((request) => ({
          id: request.id,
          user: request.addressee,
          createdAt: request.createdAt,
        })),
      };
    },

    async accept(userId, friendshipId) {
      if (!(await friendshipRepository.acceptPending(friendshipId, userId))) {
        throw new FriendRequestNotFoundError();
      }
    },

    async removeRequest(userId, friendshipId) {
      if (!(await friendshipRepository.deletePending(friendshipId, userId))) {
        throw new FriendRequestNotFoundError();
      }
    },

    async listFriends(userId) {
      const friendships = await friendshipRepository.listAcceptedForUser(userId);
      return friendships.map((friendship) =>
        friendship.requesterId === userId ? friendship.addressee : friendship.requester,
      );
    },

    async areFriends(userIdA, userIdB) {
      const friendship = await friendshipRepository.findByPair(userIdA, userIdB);
      return friendship?.status === "accepted";
    },
  };
}
