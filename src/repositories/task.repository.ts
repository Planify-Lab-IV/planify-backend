import type { TaskStatus } from "@prisma/client";
import { prisma } from "../infrastructure/prisma.js";

export interface Task {
  id: string;
  eventId: string;
  title: string;
  status: TaskStatus;
  assignedToParticipantId: string | null;
  createdByParticipantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskParams {
  eventId: string;
  title: string;
  status: TaskStatus;
  assignedToParticipantId: string | null;
  createdByParticipantId: string;
}

export interface UpdateTaskParams {
  status: TaskStatus;
  assignedToParticipantId: string | null;
}

export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  findByEventId(eventId: string): Promise<Task[]>;
  create(params: CreateTaskParams): Promise<Task>;
  update(id: string, params: UpdateTaskParams): Promise<Task>;
}

export const taskRepository: TaskRepository = {
  async findById(id) {
    return prisma.task.findUnique({
      where: { id },
    });
  },

  async findByEventId(eventId) {
    return prisma.task.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
    });
  },

  async create(params) {
    return prisma.task.create({
      data: params,
    });
  },

  async update(id, params) {
    return prisma.task.update({
      where: { id },
      data: params,
    });
  },
};
