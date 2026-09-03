// Capa de acceso a datos para la entidad Usuario.
// Es el único lugar que interactúa con Prisma para usuarios.

import { prisma } from "../infrastructure/prisma.js";

// --> Usuario canónico / público (sin datos sensibles)
export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
}

// --> Usuario interno para autenticación (incluye el hash)
export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findPublicByIdentifier(identifier: string): Promise<User | null>;
  findByIdentifier(identifier: string): Promise<UserWithPassword | null>;
  create(data: {
    name: string;
    username: string;
    email: string;
    passwordHash: string;
  }): Promise<User>;
}

export const userRepository: UserRepository = {
  async findById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, username: true, email: true },
    });
    return user;
  },

  async findByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, username: true, email: true },
    });
    return user;
  },

  // Busca un usuario por email o username sin exponer datos de autenticación.
  async findPublicByIdentifier(identifier: string): Promise<User | null> {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
      select: { id: true, name: true, username: true, email: true },
    });

    return user;
  },

  // Búsqueda exclusiva para autenticación: incluye el hash de la contraseña.
  async findByIdentifier(identifier: string): Promise<UserWithPassword | null> {
    const user = await prisma.user.findFirst({
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
      passwordHash: user.passwordHash,
    };
  },

  async create(data: {
    name: string;
    username: string;
    email: string;
    passwordHash: string;
  }): Promise<User> {
    return await prisma.user.create({
      data,
      select: { id: true, name: true, username: true, email: true },
    });
  },
};
