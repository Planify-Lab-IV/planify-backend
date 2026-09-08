import {
  ParticipantAlreadyExistsError,
  type Participant,
  type ParticipantRepository,
  type ParticipantWithPinHash,
} from "../repositories/participant.repository.js";
import type { EventRepository } from "../repositories/event.repository.js";
import type { PasswordHasher } from "../infrastructure/security/password.hasher.js";
import type { SessionTokenService } from "../infrastructure/security/session.token.service.js";
import type { AnonymousParticipantDTO } from "../validators/participant/anonimous.participant.validator.js";
import { EventUnavailableError, NotFoundError, UnauthorizedError } from "../shared/errors/index.js";

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
  async function createExistingParticipantSession(
    existingParticipant: ParticipantWithPinHash,
    pin: string,
  ): Promise<AnonymousParticipantSession> {
    if (!existingParticipant.pinHash) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const isPinValid = await passwordHasher.compare(pin, existingParticipant.pinHash);

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
      token: sessionTokenService.signParticipant(participant.id, participant.eventId),
      created: false,
    };
  }

  return {
    async enterAnonymous(eventId, dto) {
      const event = await eventRepository.findById(eventId);

      if (!event) {
        throw new NotFoundError("Evento no encontrado");
      }

      if (event.status !== "active") {
        // --> El evento debe estar activo para poder ingresar
        throw new EventUnavailableError(); // --> 409
      }

      const username = dto.name;
      const existingParticipant = await participantRepository.findByEventIdAndUsername(
        eventId,
        username,
      );

      // --> Si ya existe el participante
      if (existingParticipant) {
        return createExistingParticipantSession(existingParticipant, dto.pin);
      }

      const pinHash = await passwordHasher.hash(dto.pin);

      try {
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
      } catch (error) {
        if (!(error instanceof ParticipantAlreadyExistsError)) {
          throw error;
        }

        const concurrentlyCreatedParticipant = await participantRepository.findByEventIdAndUsername(
          eventId,
          username,
        );

        if (!concurrentlyCreatedParticipant) {
          throw error;
        }

        return createExistingParticipantSession(concurrentlyCreatedParticipant, dto.pin);
      }
    },
  };
}
