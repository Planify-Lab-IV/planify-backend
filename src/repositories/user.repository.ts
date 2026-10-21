// Capa de acceso a datos para la entidad Usuario.
// Es el único lugar que interactúa con Prisma para usuarios.

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../infrastructure/prisma.js";

type UserRepositoryClient = PrismaClient | Prisma.TransactionClient;

// --> Usuario canónico / público (sin datos sensibles)
export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string | null;
}

// --> Usuario interno para autenticación (incluye el hash)
export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findPublicByIdentifier(identifier: string): Promise<User | null>;
  findByIdentifier(identifier: string): Promise<UserWithPassword | null>;
  create(data: {
    name: string;
    username: string;
    email: string;
    passwordHash: string;
  }): Promise<User>;
  updatePassword(id: string, passwordHash: string, changedAt: Date): Promise<void>;
  findPasswordChangedAt(id: string): Promise<{ passwordChangedAt: Date | null } | null>;
  updateProfile(id: string, data: { name?: string; avatarUrl?: string }): Promise<User>;
}

export function createUserRepository(client: UserRepositoryClient): UserRepository {
  return {
    async findById(id: string): Promise<User | null> {
      const user = await client.user.findUnique({
        where: { id },
        select: { id: true, name: true, username: true, email: true, avatarUrl: true },
      });
      return user;
    },

    async findByUsername(username: string): Promise<User | null> {
      const user = await client.user.findUnique({
        where: { username },
        select: { id: true, name: true, username: true, email: true, avatarUrl: true },
      });
      return user;
    },

    async findByEmail(email: string): Promise<User | null> {
      const user = await client.user.findUnique({
        where: { email },
        select: { id: true, name: true, username: true, email: true, avatarUrl: true },
      });
      return user;
    },

    // Busca un usuario por email o username sin exponer datos de autenticación.
    async findPublicByIdentifier(identifier: string): Promise<User | null> {
      const user = await client.user.findFirst({
        where: {
          OR: [{ email: identifier }, { username: identifier }],
        },
        select: { id: true, name: true, username: true, email: true, avatarUrl: true },
      });

      return user;
    },

    // Búsqueda exclusiva para autenticación: incluye el hash de la contraseña.
    async findByIdentifier(identifier: string): Promise<UserWithPassword | null> {
      const user = await client.user.findFirst({
        where: {
          OR: [{ email: identifier }, { username: identifier }],
        },
      });

      if (!user) return null;

      return {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        passwordHash: user.passwordHash,
      };
    },

    async create(data: {
      name: string;
      username: string;
      email: string;
      passwordHash: string;
    }): Promise<User> {
      return await client.user.create({
        data,
        select: { id: true, name: true, username: true, email: true, avatarUrl: true },
      });
    },

    async updatePassword(id: string, passwordHash: string, changedAt: Date): Promise<void> {
      await client.user.update({
        where: { id },
        data: { passwordHash, passwordChangedAt: changedAt },
      });
    },

    async findPasswordChangedAt(id: string): Promise<{ passwordChangedAt: Date | null } | null> {
      return client.user.findUnique({
        where: { id },
        select: { passwordChangedAt: true },
      });
    },

    async updateProfile(id: string, data: { name?: string; avatarUrl?: string }): Promise<User> {
      return await client.user.update({
        where: { id },
        data,
        select: { id: true, name: true, username: true, email: true, avatarUrl: true },
      });
    },
  };
}

export const userRepository = createUserRepository(prisma);
