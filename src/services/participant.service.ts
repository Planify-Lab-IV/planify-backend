import type { Participant, ParticipantRepository } from "../repositories/participant.repository.js";
import type { EventRepository } from "../repositories/event.repository.js";
import type { PasswordHasher } from "../infrastructure/security/password.hasher.js";
import type { SessionTokenService } from "../infrastructure/security/session.token.service.js";
import type { AnonymousParticipantDTO } from "../validators/participant/anonimous.participant.validator.js";
import { NotFoundError, UnauthorizedError } from "../shared/errors/index.js";

export interface AnonymousParticipantSession {
  participant: Participant;
  token: string;
  created: boolean;
}

export interface ParticipantService {
  enterAnonymous(
    eventId: string,
    dto: AnonymousParticipantDTO,
  ): Promise<AnonymousParticipantSession>;
}

export function createParticipantService(
  eventRepository: EventRepository,
  participantRepository: ParticipantRepository,
  passwordHasher: PasswordHasher,
  sessionTokenService: SessionTokenService,
): ParticipantService {
  return {
    async enterAnonymous(eventId, dto) {
      const event = await eventRepository.findById(eventId);

      if (!event) {
        throw new NotFoundError("Evento no encontrado");
      }

      const username = dto.name;
      const existingParticipant = await participantRepository.findByEventIdAndUsername(
        eventId,
        username,
      );

      // --> Si ya existe el participante
      if (existingParticipant) {
        if (!existingParticipant.pinHash) {
          throw new UnauthorizedError("Credenciales inválidas");
        }

        const isPinValid = await passwordHasher.compare(dto.pin, existingParticipant.pinHash);

        if (!isPinValid) {
          throw new UnauthorizedError("Credenciales inválidas");
        }

        const participant = {
          id: existingParticipant.id,
          eventId: existingParticipant.eventId,
          username: existingParticipant.username,
          isAnonymous: existingParticipant.isAnonymous,
        };

        return {
          participant,
          token: sessionTokenService.signParticipant(participant.id, eventId),
          created: false,
        };
      }

      const pinHash = await passwordHasher.hash(dto.pin);

      const participant = await participantRepository.createAnonymous({
        eventId,
        username,
        pinHash,
      });

      return {
        participant,
        token: sessionTokenService.signParticipant(participant.id, eventId),
        created: true,
      };
    },
  };
}
