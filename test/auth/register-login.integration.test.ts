import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createAuthController } from "../../src/controllers/auth.controller.js";
import { createPasswordHasher } from "../../src/infrastructure/security/password.hasher.js";
import { createSessionTokenService } from "../../src/infrastructure/security/session.token.service.js";
import type { ParticipantRepository } from "../../src/repositories/participant.repository.js";
import type {
  User,
  UserRepository,
  UserWithPassword,
} from "../../src/repositories/user.repository.js";
import { createAuthService } from "../../src/services/auth.service.js";
import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";

const TEST_SECRET = "test-secret-that-is-long-enough-for-jwt-signing";

function toPublicUser(user: UserWithPassword): User {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

function createInMemoryUserRepository(): UserRepository {
  const users: UserWithPassword[] = [];

  return {
    async findById(id) {
      const user = users.find((candidate) => candidate.id === id);
      return user ? toPublicUser(user) : null;
    },
    async findByUsername(username) {
      const user = users.find((candidate) => candidate.username === username);
      return user ? toPublicUser(user) : null;
    },
    async findByEmail(email) {
      const user = users.find((candidate) => candidate.email === email);
      return user ? toPublicUser(user) : null;
    },
    async findPublicByIdentifier(identifier) {
      const user = users.find(
        (candidate) => candidate.username === identifier || candidate.email === identifier,
      );
      return user ? toPublicUser(user) : null;
    },
    async findByIdentifier(identifier) {
      return (
        users.find(
          (candidate) => candidate.username === identifier || candidate.email === identifier,
        ) ?? null
      );
    },
    async create({ name, username, email, passwordHash }) {
      const user = {
        id: `user-${users.length + 1}`,
        name,
        username,
        email,
        avatarUrl: null,
        passwordHash,
      };
      users.push(user);
      return toPublicUser(user);
    },
    async updateProfile(id, data) {
      const userIndex = users.findIndex((user) => user.id === id);
      if (userIndex === -1) {
        throw new Error("User not found");
      }

      const updatedUser: UserWithPassword = { ...users[userIndex]!, ...data };
      users[userIndex] = updatedUser;
      return toPublicUser(updatedUser);
    },
  };
}

const participantRepository: ParticipantRepository = {
  async findById() {
    return null;
  },
  async findByEventId() {
    return [];
  },
  async existsAnonymousWithUsername() {
    return false;
  },
  async findByEventIdAndUsername() {
    return null;
  },
  async findAttendanceById() {
    return null;
  },
  async findAttendanceByEventIdAndUserId() {
    return null;
  },
  async createAnonymous() {
    throw new Error("Not used in authentication tests");
  },
  async updateAttendance() {
    throw new Error("Not used in authentication tests");
  },
  async updateLastReadAt() {
    throw new Error("Not used in authentication tests");
  },
  async findParticipationsByUserId() {
    return [];
  },
};

function createTestApp() {
  const authService = createAuthService(
    createInMemoryUserRepository(),
    participantRepository,
    createPasswordHasher(),
    createSessionTokenService(TEST_SECRET),
  );
  const authController = createAuthController(authService);
  const app = express();

  app.use(express.json());
  app.post("/auth/register", (req, res, next) => authController.register(req, res, next));
  app.post("/auth/login", (req, res, next) => authController.login(req, res, next));
  app.use(errorHandler);

  return app;
}

describe("registro y login con bcrypt real", () => {
  it("rechaza una contraseña de solo espacios, como lo hace login", async () => {
    const app = createTestApp();
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Ana",
      username: "ana",
      email: "ana@mail.com",
      password: "        ",
    });
    const loginResponse = await request(app).post("/auth/login").send({
      identifier: "ana@mail.com",
      password: "        ",
    });

    expect(registerResponse.status).toBe(400);
    expect(loginResponse.status).toBe(400);
  });

  it("conserva los espacios de una contraseña válida para el login posterior", async () => {
    const app = createTestApp();
    const password = "  contraseña válida  ";

    const registerResponse = await request(app).post("/auth/register").send({
      name: "Ana",
      username: "ana",
      email: "ana@mail.com",
      password,
    });
    const loginResponse = await request(app).post("/auth/login").send({
      identifier: "ANA@MAIL.COM",
      password,
    });

    expect(registerResponse.status).toBe(201);
    expect(loginResponse.status).toBe(200);
  });
});
