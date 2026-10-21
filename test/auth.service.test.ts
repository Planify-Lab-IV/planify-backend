import { describe, expect, it, vi } from "vitest";
import type { PasswordHasher } from "../src/infrastructure/security/password.hasher.js";
import type { SessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import type { ParticipantRepository } from "../src/repositories/participant.repository.js";
import type { User, UserRepository } from "../src/repositories/user.repository.js";
import { createAuthService } from "../src/services/auth.service.js";
import { RegistrationConflictError } from "../src/shared/errors/index.js";
import type { RegisterDTO } from "../src/validators/auth/register.validator.js";

const registerDTO: RegisterDTO = {
  name: "Ana Pérez",
  username: "ana_perez",
  email: "ana@planify.dev",
  password: "password-segura",
};

function createInMemoryUserRepository(initialUsers: User[] = []): UserRepository {
  const users = [...initialUsers];

  return {
    findById: vi.fn(async (id) => users.find((user) => user.id === id) ?? null),
    findByUsername: vi.fn(
      async (username) => users.find((user) => user.username === username) ?? null,
    ),
    findByEmail: vi.fn(async (email) => users.find((user) => user.email === email) ?? null),
    findPublicByIdentifier: vi.fn(
      async (identifier) =>
        users.find((user) => user.username === identifier || user.email === identifier) ?? null,
    ),
    findByIdentifier: vi.fn(async () => null),
    create: vi.fn(async ({ name, username, email }) => {
      const user = { id: `user-${users.length + 1}`, name, username, email, avatarUrl: null };
      users.push(user);
      return user;
    }),
    updatePassword: vi.fn(async () => undefined),
    findPasswordChangedAt: vi.fn(async () => null),
    updateProfile: vi.fn(async (id, data) => {
      const userIndex = users.findIndex((user) => user.id === id);
      if (userIndex === -1) {
        throw new Error("User not found");
      }

      const updatedUser = { ...users[userIndex], ...data };
      users[userIndex] = updatedUser;
      return updatedUser;
    }),
  };
}

function createInMemoryParticipantRepository(
  anonymousUsernames: string[] = [],
): ParticipantRepository {
  const usernames = new Set(anonymousUsernames.map((username) => username.toLowerCase()));

  return {
    findById: vi.fn(),
    findByEventId: vi.fn(),
    existsAnonymousWithUsername: vi.fn(async (username) => usernames.has(username.toLowerCase())),
    findByEventIdAndUsername: vi.fn(),
    findAttendanceById: vi.fn(),
    findAttendanceByEventIdAndUserId: vi.fn(),
    createAnonymous: vi.fn(),
    updateAttendance: vi.fn(),
    updateLastReadAt: vi.fn(),
    findParticipationsByUserId: vi.fn(),
  };
}

function createFakePasswordHasher(): PasswordHasher {
  return {
    hash: vi.fn(async (password) => `hash:${password}`),
    compare: vi.fn(async () => false),
  };
}

function createFakeSessionTokenService(): SessionTokenService {
  return {
    sign: vi.fn((userId) => `token:${userId}`),
    verify: vi.fn(),
    signParticipant: vi.fn(),
    verifyParticipant: vi.fn(),
  };
}

function makeService({
  users = [],
  anonymousUsernames = [],
}: {
  users?: User[];
  anonymousUsernames?: string[];
} = {}) {
  const userRepository = createInMemoryUserRepository(users);
  const participantRepository = createInMemoryParticipantRepository(anonymousUsernames);
  const passwordHasher = createFakePasswordHasher();
  const sessionTokenService = createFakeSessionTokenService();
  const service = createAuthService(
    userRepository,
    participantRepository,
    passwordHasher,
    sessionTokenService,
  );

  return { service, userRepository, participantRepository, passwordHasher, sessionTokenService };
}

describe("AuthService.register", () => {
  it("crea la cuenta, hashea la contraseña y devuelve una sesión", async () => {
    const { service, userRepository, passwordHasher, sessionTokenService } = makeService();

    await expect(service.register(registerDTO)).resolves.toEqual({
      user: {
        id: "user-1",
        name: registerDTO.name,
        username: registerDTO.username,
        email: registerDTO.email,
        avatarUrl: null,
      },
      token: "token:user-1",
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith(registerDTO.password);
    expect(userRepository.create).toHaveBeenCalledWith({
      name: registerDTO.name,
      username: registerDTO.username,
      email: registerDTO.email,
      passwordHash: `hash:${registerDTO.password}`,
    });
    expect(sessionTokenService.sign).toHaveBeenCalledWith("user-1");
  });

  it("rechaza un username de otra cuenta sin hashear ni crear", async () => {
    const { service, participantRepository, userRepository, passwordHasher } = makeService({
      users: [
        {
          id: "user-existing",
          name: "Ana",
          username: registerDTO.username,
          email: "other@x.com",
          avatarUrl: null,
        },
      ],
    });

    await expect(service.register(registerDTO)).rejects.toBeInstanceOf(RegistrationConflictError);

    expect(participantRepository.existsAnonymousWithUsername).not.toHaveBeenCalled();
    expect(userRepository.create).not.toHaveBeenCalled();
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });

  it("rechaza un username de un participante anónimo activo o confirmado", async () => {
    const { service, userRepository, passwordHasher } = makeService({
      anonymousUsernames: [registerDTO.username],
    });

    await expect(service.register(registerDTO)).rejects.toBeInstanceOf(RegistrationConflictError);

    expect(userRepository.findByEmail).not.toHaveBeenCalled();
    expect(userRepository.create).not.toHaveBeenCalled();
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });

  it("rechaza un email registrado sin hashear ni crear", async () => {
    const { service, userRepository, passwordHasher } = makeService({
      users: [
        {
          id: "user-existing",
          name: "Ana",
          username: "other",
          email: registerDTO.email,
          avatarUrl: null,
        },
      ],
    });

    await expect(service.register(registerDTO)).rejects.toBeInstanceOf(RegistrationConflictError);

    expect(userRepository.create).not.toHaveBeenCalled();
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });

  it("traduce una colisión única concurrente al conflicto genérico", async () => {
    const { service, userRepository } = makeService();
    vi.mocked(userRepository.create).mockRejectedValueOnce({ code: "P2002" });

    await expect(service.register(registerDTO)).rejects.toBeInstanceOf(RegistrationConflictError);
  });

  it("normaliza el identificador del login antes de buscarlo", async () => {
    const { service, userRepository, passwordHasher } = makeService();
    vi.mocked(userRepository.findByIdentifier).mockResolvedValueOnce({
      id: "user-1",
      name: "Ana",
      username: "ana",
      email: "ana@planify.dev",
      avatarUrl: null,
      passwordHash: "stored-hash",
    });
    vi.mocked(passwordHasher.compare).mockResolvedValueOnce(true);

    await service.login({ identifier: "  ANA@PLANIFY.DEV  ", password: "password-segura" });

    expect(userRepository.findByIdentifier).toHaveBeenCalledWith("ana@planify.dev");
  });
});
