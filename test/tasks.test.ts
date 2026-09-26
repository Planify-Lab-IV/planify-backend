import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    eventParticipant: { findUnique: vi.fn(), findFirst: vi.fn() },
    task: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

describe("rutas de tareas", () => {
  const eventId = "event-1";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
  const event = {
    id: eventId,
    groupId: "group-1",
    organizerId: "user-organizer",
    name: "Asado",
    location: "Casa de Ana",
    status: "active",
    startDateTime: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    participants: [],
  };
  const participant = {
    id: "participant-ana",
    eventId,
    userId: "user-ana",
    username: "Ana",
    isAnonymous: false,
    isOrganizer: false,
    attendanceState: "not_confirmed",
  };
  const organizer = {
    ...participant,
    id: "participant-organizer",
    userId: "user-organizer",
    isOrganizer: true,
  };
  const task = {
    id: "task-1",
    eventId,
    title: "Comprar carne",
    status: "unassigned",
    assignedToParticipantId: null,
    createdByParticipantId: participant.id,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea una tarea sin asignar para un usuario registrado", async () => {
    const createdTask = { ...task, title: "Comprar pan" };
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.task.create).mockResolvedValueOnce(createdTask as never);

    const response = await request(app)
      .post(`/events/${eventId}/tasks`)
      .set("Authorization", `Bearer ${tokenService.sign(participant.userId)}`)
      .send({ title: "Comprar pan" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      ...createdTask,
      createdAt: createdTask.createdAt.toJSON(),
      updatedAt: createdTask.updatedAt.toJSON(),
    });
    expect(prisma.task.create).toHaveBeenCalledWith({
      data: {
        eventId,
        title: "Comprar pan",
        status: "unassigned",
        assignedToParticipantId: null,
        createdByParticipantId: participant.id,
      },
    });
  });

  it("lista las tareas del evento para un participante", async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValueOnce(event as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.task.findMany).mockResolvedValueOnce([task] as never);

    const response = await request(app)
      .get(`/events/${eventId}/tasks`)
      .set("Authorization", `Bearer ${tokenService.sign(participant.userId)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      tasks: [
        {
          ...task,
          createdAt: task.createdAt.toJSON(),
          updatedAt: task.updatedAt.toJSON(),
        },
      ],
    });
  });

  it("permite tomar una tarea sin asignar", async () => {
    const claimedTask = { ...task, status: "pending", assignedToParticipantId: participant.id };
    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(task as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);
    vi.mocked(prisma.task.update).mockResolvedValueOnce(claimedTask as never);

    const response = await request(app)
      .post(`/tasks/${task.id}/claim`)
      .set("Authorization", `Bearer ${tokenService.sign(participant.userId)}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("pending");
    expect(response.body.assignedToParticipantId).toBe(participant.id);
  });

  it("rechaza tomar una tarea que ya tiene dueño", async () => {
    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
      ...task,
      status: "pending",
      assignedToParticipantId: "participant-other",
    } as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);

    const response = await request(app)
      .post(`/tasks/${task.id}/claim`)
      .set("Authorization", `Bearer ${tokenService.sign(participant.userId)}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("permite al organizador asignar una tarea", async () => {
    const assignee = { ...participant, id: "participant-beto", userId: "user-beto" };
    const assignedTask = { ...task, status: "pending", assignedToParticipantId: assignee.id };
    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(task as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(organizer as never);
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValueOnce(assignee as never);
    vi.mocked(prisma.task.update).mockResolvedValueOnce(assignedTask as never);

    const response = await request(app)
      .post(`/tasks/${task.id}/assign`)
      .set("Authorization", `Bearer ${tokenService.sign(organizer.userId)}`)
      .send({ participantId: assignee.id });

    expect(response.status).toBe(200);
    expect(response.body.assignedToParticipantId).toBe(assignee.id);
  });

  it("rechaza asignar una tarea si quien actúa no es organizador", async () => {
    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce(task as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);

    const response = await request(app)
      .post(`/tasks/${task.id}/assign`)
      .set("Authorization", `Bearer ${tokenService.sign(participant.userId)}`)
      .send({ participantId: "participant-beto" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("rechaza completar una tarea por otro participante", async () => {
    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
      ...task,
      status: "pending",
      assignedToParticipantId: "participant-owner",
    } as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(participant as never);

    const response = await request(app)
      .post(`/tasks/${task.id}/complete`)
      .set("Authorization", `Bearer ${tokenService.sign(participant.userId)}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("rechaza operar una tarea de otro evento", async () => {
    vi.mocked(prisma.task.findUnique).mockResolvedValueOnce({
      ...task,
      eventId: "event-2",
    } as never);
    vi.mocked(prisma.eventParticipant.findFirst).mockResolvedValueOnce(null);

    const response = await request(app)
      .post(`/tasks/${task.id}/claim`)
      .set("Authorization", `Bearer ${tokenService.sign(participant.userId)}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("permite crear una tarea con una sesión anónima válida", async () => {
    const anonymousParticipant = {
      ...participant,
      id: "participant-anonymous",
      userId: null,
      isAnonymous: true,
    };
    const anonymousTask = { ...task, createdByParticipantId: anonymousParticipant.id };
    vi.mocked(prisma.eventParticipant.findUnique).mockResolvedValue(anonymousParticipant as never);
    vi.mocked(prisma.event.findUnique).mockResolvedValue(event as never);
    vi.mocked(prisma.task.create).mockResolvedValueOnce(anonymousTask as never);

    const response = await request(app)
      .post(`/events/${eventId}/tasks`)
      .set(
        "Authorization",
        `Bearer ${tokenService.signParticipant(anonymousParticipant.id, eventId)}`,
      )
      .send({ title: task.title });

    expect(response.status).toBe(201);
    expect(response.body.createdByParticipantId).toBe(anonymousParticipant.id);
  });

  it("requiere autenticación para listar tareas", async () => {
    const response = await request(app).get(`/events/${eventId}/tasks`);

    expect(response.status).toBe(401);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
});
