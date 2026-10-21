import type { SessionTokenService } from "../../infrastructure/security/session.token.service.js";
import type { UserRepository } from "../../repositories/user.repository.js";
import { UnauthorizedError } from "../errors/index.js";

export async function validateUserSession(
  token: string,
  sessionTokenService: SessionTokenService,
  userRepository: UserRepository,
): Promise<string> {
  let session;
  try {
    session = sessionTokenService.verify(token);
  } catch {
    throw new UnauthorizedError("Token de usuario inválido o expirado");
  }

  const user = await userRepository.findPasswordChangedAt(session.userId);
  if (!user) {
    throw new UnauthorizedError("La sesión ya no corresponde a un usuario activo");
  }

  if (
    user.passwordChangedAt &&
    session.issuedAt < Math.floor(user.passwordChangedAt.getTime() / 1000)
  ) {
    throw new UnauthorizedError("La sesión fue invalidada por un cambio de contraseña");
  }

  return session.userId;
}
