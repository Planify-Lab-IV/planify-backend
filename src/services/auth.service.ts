// Lógica de negocio para la autenticación de usuarios.
// Coordina repositorio, hasher de contraseñas y emisor de tokens de sesión.

import type { Usuario, UsuarioRepository } from "../repositories/usuario.repository.js";
import type { PasswordHasher } from "../infrastructure/security/password.hasher.js";
import type { SessionTokenService } from "../infrastructure/security/session.token.service.js";
import { UnauthorizedError, ValidationError } from "../shared/errors/index.js";

// --> Solo los datos necesarios para el login
export interface LoginDTO {
  identifier: string;
  password: string;
}

// --> Lo que el service promete devolver
export interface AuthResult {
  user: Usuario;
  token: string;
}

export interface AuthService {
  login(dto: LoginDTO): Promise<AuthResult>;
}

export function createAuthService(
  usuarioRepository: UsuarioRepository,
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

      const cleanIdentifier = identifier.trim();

      // --> Busca el usuario por email o nombre
      const user = await usuarioRepository.findByIdentifier(cleanIdentifier);
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
          nombre: user.nombre,
          email: user.email,
        },
        token,
      };
    },
  };
}
