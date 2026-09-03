// Aplicas reglas de negocio como validaciones y alteraciones

import type { EventoRepository, EventoCreado } from "../repositories/evento.repository.js";
import type { GrupoRepository } from "../repositories/grupo.repository.js";
import type { UsuarioRepository, UsuarioConPassword } from "../repositories/usuario.repository.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../shared/errors/index.js";

export interface CreateEventDTO {
  nombre: string;
  textPlace?: string | undefined;
  grupoId?: string | undefined;
  nuevoGrupoNombre?: string | undefined;
  memberIdentifiers?: string[] | undefined;
}

export interface EventService {
  createEvent(creatorId: string, dto: CreateEventDTO): Promise<EventoCreado>;
}

export function createEventService(
  eventoRepository: EventoRepository,
  grupoRepository: GrupoRepository,
  usuarioRepository: UsuarioRepository,
): EventService {
  return {
    async createEvent(creatorId: string, dto: CreateEventDTO): Promise<EventoCreado> {
      if (!dto.nombre || typeof dto.nombre !== "string" || dto.nombre.trim() === "") {
        throw new ValidationError("El nombre del evento es requerido");
      }

      const hasGrupoId = Boolean(dto.grupoId && dto.grupoId.trim() !== "");
      const hasNuevoGrupo = Boolean(dto.nuevoGrupoNombre && dto.nuevoGrupoNombre.trim() !== "");

      // --> Validación de exclusión mutua
      if (hasGrupoId && hasNuevoGrupo) {
        throw new ValidationError("Debe enviarse grupoId o nuevoGrupoNombre, pero no ambos");
      }
      if (!hasGrupoId && !hasNuevoGrupo) {
        throw new ValidationError("Debe enviarse grupoId o nuevoGrupoNombre");
      }

      // --> Buscar datos del creador autenticado
      const creator = await usuarioRepository.findById(creatorId);
      if (!creator) {
        throw new NotFoundError("Organizador no encontrado");
      }

      // --> Caso grupo existente
      if (hasGrupoId) {
        const grupoId = dto.grupoId!.trim();
        const grupo = await grupoRepository.findById(grupoId);

        if (!grupo) {
          throw new NotFoundError("El grupo especificado no existe");
        }

        const isMember = grupo.miembros.some((m) => m.usuarioId === creatorId); // --> Busca alguno que cumpla con la condicion
        if (!isMember) {
          throw new ForbiddenError("El organizador no pertenece al grupo especificado");
        }

        const participantes = grupo.miembros.map((m) => ({
          usuarioId: m.usuario.id,
          username: m.usuario.nombre,
          esOrganizador: m.usuario.id === creatorId,
        }));

        return eventoRepository.createAtomic({
          nombre: dto.nombre.trim(),
          textPlace: dto.textPlace?.trim(),
          creatorId,
          grupoId,
          participantes,
        });
      }

      // --> Caso de nuevo grupo
      const nuevoGrupoNombre = dto.nuevoGrupoNombre!.trim();
      const rawIdentifiers = dto.memberIdentifiers ?? [];

      const resolvedUsers: UsuarioConPassword[] = [];

      for (const identifier of rawIdentifiers) {
        // --> Busca que existan todos los usuarios en la db
        const cleanIdentifier = identifier.trim();
        if (!cleanIdentifier) continue;

        const user = await usuarioRepository.findByIdentifier(cleanIdentifier);
        if (!user) {
          throw new NotFoundError(`Usuario no encontrado para el identificador: ${identifier}`);
        }

        if (!resolvedUsers.some((u) => u.id === user.id)) {
          resolvedUsers.push(user);
        } // --> Agrega al creador aunque no se haya incluido
      }

      // --> Garantizar que el organizador esté siempre incluido en el nuevo grupo
      if (!resolvedUsers.some((u) => u.id === creator.id)) {
        resolvedUsers.push({
          id: creator.id,
          nombre: creator.nombre,
          email: creator.email,
          passwordHash: "",
        });
      }

      const participantes = resolvedUsers.map((u) => ({
        usuarioId: u.id,
        username: u.nombre,
        esOrganizador: u.id === creatorId,
      }));

      return eventoRepository.createAtomic({
        nombre: dto.nombre.trim(),
        textPlace: dto.textPlace?.trim(),
        creatorId,
        nuevoGrupo: {
          nombre: nuevoGrupoNombre,
          miembrosIds: resolvedUsers.map((u) => u.id),
        },
        participantes,
      });
    },
  };
}
