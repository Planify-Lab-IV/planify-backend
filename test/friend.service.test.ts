import { describe, expect, it, vi } from "vitest";
import type {
  Friendship,
  FriendshipRepository,
  FriendshipWithUsers,
} from "../src/repositories/friendship.repository.js";
import type { User, UserRepository } from "../src/repositories/user.repository.js";
import { createFriendService } from "../src/services/friend.service.js";
import {
  FriendRequestNotFoundError,
  FriendshipAlreadyExistsError,
  NotFoundError,
  ValidationError,
} from "../src/shared/errors/index.js";

const ana: User = {
  id: "ana",
  name: "Ana",
  username: "ana",
  email: "ana@planify.dev",
  avatarUrl: null,
};
const beto: User = {
  id: "beto",
  name: "Beto",
  username: "beto",
  email: "beto@planify.dev",
  avatarUrl: null,
};
const cata: User = {
  id: "cata",
  name: "Cata",
  username: "cata",
  email: "cata@planify.dev",
  avatarUrl: null,
};

function relationship(
  overrides: Partial<Friendship> = {},
  requester: User = ana,
  addressee: User = beto,
): FriendshipWithUsers {
  return {
    id: "request-1",
    requesterId: requester.id,
    addresseeId: addressee.id,
    status: "pending",
    createdAt: new Date("2026-10-19T12:00:00Z"),
    requester: { id: requester.id, name: requester.name, username: requester.username },
    addressee: { id: addressee.id, name: addressee.name, username: addressee.username },
    ...overrides,
  };
}

function makeService(users: User[] = [ana, beto, cata], friendships: FriendshipWithUsers[] = []) {
  const userRepository: UserRepository = {
    findById: vi.fn(async (id) => users.find((user) => user.id === id) ?? null),
    findByUsername: vi.fn(async () => null),
    findByEmail: vi.fn(async () => null),
    findPublicByIdentifier: vi.fn(async () => null),
    findByIdentifier: vi.fn(async () => null),
    create: vi.fn(async () => ana),
    updatePassword: vi.fn(async () => undefined),
    findPasswordChangedAt: vi.fn(async () => ({ passwordChangedAt: null })),
    updateProfile: vi.fn(async () => ana),
    searchByUsername: vi.fn(async (query, { excludeUserId, limit }) =>
      users
        .filter((user) => user.id !== excludeUserId && user.username.includes(query.toLowerCase()))
        .slice(0, limit)
        .map(({ id, name, username }) => ({ id, name, username })),
    ),
  };
  const friendshipRepository: FriendshipRepository = {
    findByPair: vi.fn(
      async (userIdA, userIdB) =>
        friendships.find(
          (item) =>
            (item.requesterId === userIdA && item.addresseeId === userIdB) ||
            (item.requesterId === userIdB && item.addresseeId === userIdA),
        ) ?? null,
    ),
    create: vi.fn(async ({ requesterId, addresseeId }) => {
      const requester = users.find((user) => user.id === requesterId)!;
      const addressee = users.find((user) => user.id === addresseeId)!;
      const item = relationship({ id: `request-${friendships.length + 1}` }, requester, addressee);
      friendships.push(item);
      return item;
    }),
    acceptPending: vi.fn(async (id, addresseeId) => {
      const item = friendships.find(
        (candidate) =>
          candidate.id === id &&
          candidate.addresseeId === addresseeId &&
          candidate.status === "pending",
      );
      if (!item) return false;
      item.status = "accepted";
      return true;
    }),
    deletePending: vi.fn(async (id, userId) => {
      const index = friendships.findIndex(
        (item) =>
          item.id === id &&
          item.status === "pending" &&
          (item.requesterId === userId || item.addresseeId === userId),
      );
      if (index < 0) return false;
      friendships.splice(index, 1);
      return true;
    }),
    listAcceptedForUser: vi.fn(async (userId) =>
      friendships.filter(
        (item) =>
          item.status === "accepted" &&
          (item.requesterId === userId || item.addresseeId === userId),
      ),
    ),
    listPendingReceived: vi.fn(async (userId) =>
      friendships.filter((item) => item.status === "pending" && item.addresseeId === userId),
    ),
    listPendingSent: vi.fn(async (userId) =>
      friendships.filter((item) => item.status === "pending" && item.requesterId === userId),
    ),
    listRelationsForUser: vi.fn(async (userId, otherUserIds) =>
      friendships.filter(
        (item) =>
          (item.requesterId === userId && otherUserIds.includes(item.addresseeId)) ||
          (item.addresseeId === userId && otherUserIds.includes(item.requesterId)),
      ),
    ),
  };

  return {
    service: createFriendService(friendshipRepository, userRepository),
    friendshipRepository,
    userRepository,
  };
}

describe("FriendService", () => {
  it("busca por username, expone relaciones pendientes y excluye amistades aceptadas", async () => {
    const { service } = makeService(
      [ana, beto, cata],
      [
        relationship({}, ana, beto),
        relationship({ id: "accepted", status: "accepted" }, cata, ana),
      ],
    );

    await expect(service.search(ana.id, "a")).rejects.toBeInstanceOf(ValidationError);
    await expect(service.search(ana.id, "ta")).resolves.toEqual([]);
    await expect(service.search(beto.id, "an")).resolves.toEqual([
      {
        id: ana.id,
        name: ana.name,
        username: ana.username,
        relationship: "request_received",
        requestId: "request-1",
      },
    ]);
  });

  it("crea solicitudes y nunca devuelve el email del destinatario", async () => {
    const { service, friendshipRepository } = makeService();

    await expect(service.sendRequest(ana.id, beto.id)).resolves.toEqual({
      id: "request-1",
      user: { id: beto.id, name: beto.name, username: beto.username },
      createdAt: new Date("2026-10-19T12:00:00Z"),
    });
    expect(friendshipRepository.create).toHaveBeenCalledWith({
      requesterId: ana.id,
      addresseeId: beto.id,
    });
  });

  it.each([
    ["a sí misma", ana.id, ana.id, ValidationError],
    ["a una persona inexistente", ana.id, "missing", NotFoundError],
  ])("rechaza una solicitud %s", async (_description, requesterId, addresseeId, error) => {
    const { service } = makeService();
    await expect(service.sendRequest(requesterId, addresseeId)).rejects.toBeInstanceOf(error);
  });

  it("rechaza una solicitud repetida, incluso si la carrera llega a Prisma", async () => {
    const existing = relationship({}, ana, beto);
    await expect(
      makeService([ana, beto], [existing]).service.sendRequest(beto.id, ana.id),
    ).rejects.toBeInstanceOf(FriendshipAlreadyExistsError);

    const { service, friendshipRepository } = makeService([ana, beto]);
    vi.mocked(friendshipRepository.create).mockRejectedValueOnce({ code: "P2002" });
    await expect(service.sendRequest(ana.id, beto.id)).rejects.toBeInstanceOf(
      FriendshipAlreadyExistsError,
    );
  });

  it("separa solicitudes recibidas y enviadas usando siempre a la otra persona", async () => {
    const { service } = makeService(
      [ana, beto, cata],
      [relationship({}, ana, beto), relationship({ id: "request-2" }, cata, ana)],
    );
    await expect(service.listRequests(ana.id)).resolves.toEqual({
      received: [
        {
          id: "request-2",
          user: { id: cata.id, name: cata.name, username: cata.username },
          createdAt: new Date("2026-10-19T12:00:00Z"),
        },
      ],
      sent: [
        {
          id: "request-1",
          user: { id: beto.id, name: beto.name, username: beto.username },
          createdAt: new Date("2026-10-19T12:00:00Z"),
        },
      ],
    });
  });

  it("acepta solo como receptor y devuelve 404 lógico si la operación atómica no actualiza", async () => {
    const { service, friendshipRepository } = makeService(
      [ana, beto],
      [relationship({}, ana, beto)],
    );
    await expect(service.accept(beto.id, "request-1")).resolves.toBeUndefined();
    vi.mocked(friendshipRepository.acceptPending).mockResolvedValueOnce(false);
    await expect(service.accept(ana.id, "request-1")).rejects.toBeInstanceOf(
      FriendRequestNotFoundError,
    );
  });

  it("permite rechazar o cancelar y deja el par disponible para una nueva solicitud", async () => {
    const { service } = makeService([ana, beto], [relationship({}, ana, beto)]);
    await expect(service.removeRequest(beto.id, "request-1")).resolves.toBeUndefined();
    await expect(service.sendRequest(beto.id, ana.id)).resolves.toMatchObject({
      user: { id: ana.id },
    });
  });

  it("devuelve 404 lógico al cancelar como tercero, una solicitud aceptada o una carrera perdida", async () => {
    const { service, friendshipRepository } = makeService(
      [ana, beto, cata],
      [relationship({}, ana, beto)],
    );
    await expect(service.removeRequest(cata.id, "request-1")).rejects.toBeInstanceOf(
      FriendRequestNotFoundError,
    );
    vi.mocked(friendshipRepository.deletePending).mockResolvedValueOnce(false);
    await expect(service.removeRequest(ana.id, "request-1")).rejects.toBeInstanceOf(
      FriendRequestNotFoundError,
    );
  });

  it("lista amistades aceptadas para ambos lados y resuelve areFriends en ambos sentidos", async () => {
    const { service } = makeService([ana, beto], [relationship({ status: "accepted" }, ana, beto)]);
    await expect(service.listFriends(ana.id)).resolves.toEqual([
      { id: beto.id, name: beto.name, username: beto.username },
    ]);
    await expect(service.listFriends(beto.id)).resolves.toEqual([
      { id: ana.id, name: ana.name, username: ana.username },
    ]);
    await expect(service.areFriends(ana.id, beto.id)).resolves.toBe(true);
    await expect(service.areFriends(beto.id, ana.id)).resolves.toBe(true);
  });
});
