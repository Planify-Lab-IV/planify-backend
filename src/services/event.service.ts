import type { Event, EventRepository } from "../repositories/event.repository.js";
import type { GroupRepository } from "../repositories/group.repository.js";
import type { UserRepository, User } from "../repositories/user.repository.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../shared/errors/index.js";
import type { CreateEventDTO } from "../validators/event/event.validator.js";

export interface EventService {
  createEvent(organizerId: string, dto: CreateEventDTO): Promise<Event>;
}

export function createEventService(
  eventRepository: EventRepository,
  groupRepository: GroupRepository,
  userRepository: UserRepository,
): EventService {
  return {
    async createEvent(organizerId: string, dto: CreateEventDTO): Promise<Event> {
      if (!dto.name.trim()) {
        throw new ValidationError("El nombre del evento es requerido");
      }

      const hasGroupId = Boolean(dto.groupId?.trim());
      const hasNewGroupName = Boolean(dto.newGroupName?.trim());

      if (hasGroupId && hasNewGroupName) {
        throw new ValidationError("Debe enviarse groupId o newGroupName, pero no ambos");
      }
      if (!hasGroupId && !hasNewGroupName) {
        throw new ValidationError("Debe enviarse groupId o newGroupName");
      }

      const organizer = await userRepository.findById(organizerId);
      if (!organizer) {
        throw new NotFoundError("Organizador no encontrado");
      }

      if (hasGroupId) {
        const groupId = dto.groupId!.trim();
        const group = await groupRepository.findById(groupId);

        if (!group) {
          throw new NotFoundError("El grupo especificado no existe");
        }

        const isMember = group.members.some((member) => member.userId === organizerId);
        if (!isMember) {
          throw new ForbiddenError("El organizador no pertenece al grupo especificado");
        }

        return eventRepository.createAtomic({
          name: dto.name.trim(),
          location: dto.location.trim(),
          organizerId,
          groupId,
          participants: group.members.map((member) => ({
            userId: member.user.id,
            username: member.user.username,
            isOrganizer: member.user.id === organizerId,
          })),
        });
      }

      const newGroupName = dto.newGroupName!.trim();
      const resolvedUsers: User[] = [];

      for (const identifier of dto.memberIdentifiers ?? []) {
        const cleanIdentifier = identifier.trim();
        if (!cleanIdentifier) continue;

        const user = await userRepository.findPublicByIdentifier(cleanIdentifier);
        if (!user) {
          throw new NotFoundError(`Usuario no encontrado para el identificador: ${identifier}`);
        }

        if (!resolvedUsers.some((resolvedUser) => resolvedUser.id === user.id)) {
          resolvedUsers.push(user);
        }
      }

      if (!resolvedUsers.some((user) => user.id === organizer.id)) {
        resolvedUsers.push(organizer);
      }

      return eventRepository.createAtomic({
        name: dto.name.trim(),
        location: dto.location.trim(),
        organizerId,
        newGroup: {
          name: newGroupName,
          memberIds: resolvedUsers.map((user) => user.id),
        },
        participants: resolvedUsers.map((user) => ({
          userId: user.id,
          username: user.username,
          isOrganizer: user.id === organizerId,
        })),
      });
    },
  };
}
