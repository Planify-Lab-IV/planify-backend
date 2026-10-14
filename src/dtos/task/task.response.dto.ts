import type { Task } from "../../repositories/task.repository.js";

export interface TaskResponseDTO {
  id: string;
  eventId: string;
  title: string;
  status: Task["status"];
  assignedToParticipantId: string | null;
  createdByParticipantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toTaskResponseDTO(task: Task): TaskResponseDTO {
  return {
    id: task.id,
    eventId: task.eventId,
    title: task.title,
    status: task.status,
    assignedToParticipantId: task.assignedToParticipantId,
    createdByParticipantId: task.createdByParticipantId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
