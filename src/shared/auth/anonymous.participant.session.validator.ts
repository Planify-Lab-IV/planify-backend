import type { SessionTokenService } from "../../infrastructure/security/session.token.service.js";
import type { EventRepository } from "../../repositories/event.repository.js";
import type { ParticipantRepository } from "../../repositories/participant.repository.js";
import { UnauthorizedError } from "../errors/index.js";

export interface AnonymousParticipantSessionValidationOptions {
  requireActiveEvent?: boolean;
}

// --> Verifica que un token anónimo siga representando una sesión utilizable.
export async function validateAnonymousParticipantSession(
  token: string,
  sessionTokenService: SessionTokenService,
  participantRepository: ParticipantRepository,
  eventRepository: EventRepository,
  options: AnonymousParticipantSessionValidationOptions = {},
) {
  let session;
  try {
    session = sessionTokenService.verifyParticipant(token);
  } catch {
    throw new UnauthorizedError("Token de participante inválido o expirado");
  }

  const participant = await participantRepository.findById(session.participantId);
  if (!participant || !participant.isAnonymous || participant.eventId !== session.eventId) {
    throw new UnauthorizedError("Sesión de participante inválida");
  }

  const event = await eventRepository.findById(session.eventId);
  const requireActiveEvent = options.requireActiveEvent ?? true;
  if (!event || (requireActiveEvent && event.status !== "active")) {
    // --> El evento debe existir y estar activo
    throw new UnauthorizedError("Sesión de participante inválida");
  }

  return session;
}
