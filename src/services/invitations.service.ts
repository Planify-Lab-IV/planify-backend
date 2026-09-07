import { randomBytes } from "node:crypto";
import type { EventRepository } from "../repositories/event.repository.js";
import {
  InvitationTokenAlreadyExistsError,
  type InvitationRepository,
} from "../repositories/invitation.repository.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../shared/errors/index.js";
import type { CreateInvitationDTO } from "../validators/invitation/create.invitation.validator.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_TOKEN_GENERATION_ATTEMPTS = 3;

export interface InvitationCreationResult {
  invitationUrl: string;
}

export interface InvitationResolutionResult {
  eventId: string;
}

export interface InvitationsService {
  createInvitation(
    requesterId: string,
    eventId: string,
    dto: CreateInvitationDTO,
  ): Promise<InvitationCreationResult>;
  resolveInvitationToken(token: string): Promise<InvitationResolutionResult>;
}

export type Clock = () => Date;
export type InvitationTokenGenerator = () => string;

export function createInvitationsService(
  eventRepository: EventRepository,
  invitationRepository: InvitationRepository,
  now: Clock = () => new Date(),
  generateToken: InvitationTokenGenerator = () => randomBytes(32).toString("base64url"),
): InvitationsService {
  // --> Token de 32 bytes en un string base 64
  return {
    async createInvitation(requesterId, eventId, dto) {
      const event = await eventRepository.findById(eventId);

      if (!event) {
        throw new NotFoundError("Evento no encontrado");
      }

      if (event.organizerId !== requesterId) {
        throw new ForbiddenError("Solo el organizador puede crear invitaciones");
      }

      if (dto.expiresAt && dto.expiresAt <= now()) {
        throw new ValidationError("La fecha de vencimiento debe ser futura");
      }

      // --> Intenta generar 3 veces el token si se detecta una colision en la DB
      for (let attempt = 0; attempt < MAX_TOKEN_GENERATION_ATTEMPTS; attempt += 1) {
        const token = generateToken();

        try {
          await invitationRepository.create({
            eventId,
            uniqueToken: token,
            expiresAt: dto.expiresAt,
          });

          return {
            invitationUrl: `planify://invite/${token}`,
          };
        } catch (error) {
          if (!(error instanceof InvitationTokenAlreadyExistsError)) {
            throw error;
          }
        }
      }

      throw new Error("No se pudo generar un token de invitación único");
    },

    async resolveInvitationToken(token) {
      // --> Si el token cumple el patron regex
      if (!TOKEN_PATTERN.test(token)) {
        throw new ValidationError("El token de invitación es inválido");
      }

      const invitation = await invitationRepository.findByUniqueToken(token);

      if (
        !invitation ||
        invitation.status !== "active" ||
        (invitation.expiresAt !== null && invitation.expiresAt <= now())
      ) {
        throw new NotFoundError("Invitación no encontrada");
      }

      return {
        eventId: invitation.eventId,
      };
    },
  };
}
