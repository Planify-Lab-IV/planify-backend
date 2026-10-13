// Lógica de negocio para la autenticación de usuarios.
// Coordina repositorio, hasher de contraseñas y emisor de tokens de sesión.

import type { User, UserRepository } from "../repositories/user.repository.js";
import type { ParticipantRepository } from "../repositories/participant.repository.js";
import type { PasswordHasher } from "../infrastructure/security/password.hasher.js";
import type { SessionTokenService } from "../infrastructure/security/session.token.service.js";
import type { RegisterDTO } from "../validators/auth/register.validator.js";
import {
  RegistrationConflictError,
  UnauthorizedError,
  ValidationError,
} from "../shared/errors/index.js";

// --> Solo los datos necesarios para el login
export interface LoginDTO {
  identifier: string;
  password: string;
}

// --> Lo que el service promete devolver
export interface AuthResult {
  user: User;
  token: string;
}

export interface AuthService {
  login(dto: LoginDTO): Promise<AuthResult>;
  register(dto: RegisterDTO): Promise<AuthResult>;
  getCurrentUser(userId: string): Promise<User>;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export function createAuthService(
  userRepository: UserRepository,
  participantRepository: ParticipantRepository,
  passwordHasher: PasswordHasher,
  sessionTokenService: SessionTokenService,
): AuthService {
  return {
    async login({ identifier, password }: LoginDTO): Promise<AuthResult> {
      // --> Validaciones básicas de entrada
      if (!identifier || typeof identifier !== "string" || identifier.trim() === "") {
        throw new ValidationError("El identificador es requerido");
      }
      if (!password || typeof password !== "string" || password.trim() === "") {
        throw new ValidationError("La contraseña es requerida");
      }

      const cleanIdentifier = identifier.trim().toLowerCase();

      // --> Busca el usuario por email o username.
      const user = await userRepository.findByIdentifier(cleanIdentifier);
      if (!user) {
        throw new UnauthorizedError("Credenciales inválidas");
      }

      // --> Compara la password provista con el hash almacenado
      const isPasswordValid = await passwordHasher.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new UnauthorizedError("Credenciales inválidas");
      }

      // --> Generar el JWT firmado para la sesión
      const token = sessionTokenService.sign(user.id);

      // --> Retornar usuario canónico (sin passwordHash) y el token emitido
      return {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
        },
        token,
      };
    },

    async register(dto: RegisterDTO): Promise<AuthResult> {
      const userWithUsername = await userRepository.findByUsername(dto.username);

      if (
        userWithUsername ||
        (await participantRepository.existsAnonymousWithUsername(dto.username))
      ) {
        throw new RegistrationConflictError();
      }

      const userWithEmail = await userRepository.findByEmail(dto.email);

      if (userWithEmail) {
        throw new RegistrationConflictError();
      }

      const passwordHash = await passwordHasher.hash(dto.password);

      try {
        const user = await userRepository.create({
          name: dto.name,
          username: dto.username,
          email: dto.email,
          passwordHash,
        });

        return {
          user,
          token: sessionTokenService.sign(user.id),
        };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new RegistrationConflictError();
        }

        throw error;
      }
    },

    async getCurrentUser(userId: string): Promise<User> {
      const user = await userRepository.findById(userId);

      if (!user) {
        throw new UnauthorizedError("La sesión ya no corresponde a un usuario activo");
      }

      return user;
    },
  };
}
