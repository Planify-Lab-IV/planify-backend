import { prisma } from "../infrastructure/prisma.js";

export const invitationStatuses = ["active", "cancelled"] as const;

export type InvitationStatus = (typeof invitationStatuses)[number];

export interface Invitation {
  id: string;
  eventId: string;
  uniqueToken: string;
  expiresAt: Date | null;
  status: InvitationStatus;
}

export interface CreateInvitationParams {
  eventId: string;
  uniqueToken: string;
  expiresAt: Date | null;
}

export interface InvitationRepository {
  create(params: CreateInvitationParams): Promise<Invitation>;
  findByUniqueToken(uniqueToken: string): Promise<Invitation | null>;
}

export class InvitationTokenAlreadyExistsError extends Error {
  constructor() {
    super("Ya existe una invitación con ese token");
    this.name = "InvitationTokenAlreadyExistsError";
  }
}

function parseInvitationStatus(status: string): InvitationStatus {
  if ((invitationStatuses as readonly string[]).includes(status)) {
    return status as InvitationStatus;
  }

  throw new Error(`Invalid invitation status in persistence: ${status}`);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export const invitationRepository: InvitationRepository = {
  async create({ eventId, uniqueToken, expiresAt }): Promise<Invitation> {
    try {
      const invitation = await prisma.invitation.create({
        data: {
          eventId,
          uniqueToken,
          expiresAt,
        },
        select: {
          id: true,
          eventId: true,
          uniqueToken: true,
          expiresAt: true,
          status: true,
        },
      });

      return { ...invitation, status: parseInvitationStatus(invitation.status) };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new InvitationTokenAlreadyExistsError();
      }

      throw error;
    }
  },

  async findByUniqueToken(uniqueToken: string): Promise<Invitation | null> {
    const invitation = await prisma.invitation.findUnique({
      where: { uniqueToken },
      select: {
        id: true,
        eventId: true,
        uniqueToken: true,
        expiresAt: true,
        status: true,
      },
    });

    return invitation ? { ...invitation, status: parseInvitationStatus(invitation.status) } : null;
  },
};
