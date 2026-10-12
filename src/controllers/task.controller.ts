import type { NextFunction, Request, Response } from "express";
import { toTaskResponseDTO } from "../dtos/task/task.response.dto.js";
import type { TaskService } from "../services/task.service.js";
import { ValidationError } from "../shared/errors/index.js";
import { getAttendanceActor, getEventId } from "../shared/request.helpers.js";
import { validateAssignTaskDTO } from "../validators/task/assign.task.validator.js";
import { validateCreateTaskDTO } from "../validators/task/create.task.validator.js";

export interface TaskController {
  list(req: Request, res: Response, next: NextFunction): Promise<void>;
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
  claim(req: Request, res: Response, next: NextFunction): Promise<void>;
  assignTo(req: Request, res: Response, next: NextFunction): Promise<void>;
  complete(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createTaskController(taskService: TaskService): TaskController {
  function getTaskId(req: Request): string {
    const taskId = req.params.id;
    if (typeof taskId !== "string" || taskId.trim() === "") {
      throw new ValidationError("El id de la tarea es requerido");
    }

    return taskId;
  }

  return {
    async list(req, res, next) {
      try {
        const eventId = getEventId(req);
        const actor = getAttendanceActor(req);
        const tasks = await taskService.list(eventId, actor);

        res.status(200).json({ tasks: tasks.map(toTaskResponseDTO) });
      } catch (error) {
        next(error);
      }
    },

    async create(req, res, next) {
      try {
        const eventId = getEventId(req);
        const actor = getAttendanceActor(req);
        const dto = validateCreateTaskDTO(req.body);
        const task = await taskService.create(eventId, actor, dto.title);

        res.status(201).json(toTaskResponseDTO(task));
      } catch (error) {
        next(error);
      }
    },

    async claim(req, res, next) {
      try {
        const taskId = getTaskId(req);
        const actor = getAttendanceActor(req);
        const task = await taskService.claim(taskId, actor);

        res.status(200).json(toTaskResponseDTO(task));
      } catch (error) {
        next(error);
      }
    },

    async assignTo(req, res, next) {
      try {
        const taskId = getTaskId(req);
        const actor = getAttendanceActor(req);
        const dto = validateAssignTaskDTO(req.body);
        const task = await taskService.assignTo(taskId, dto.participantId, actor);

        res.status(200).json(toTaskResponseDTO(task));
      } catch (error) {
        next(error);
      }
    },

    async complete(req, res, next) {
      try {
        const taskId = getTaskId(req);
        const actor = getAttendanceActor(req);
        const task = await taskService.complete(taskId, actor);

        res.status(200).json(toTaskResponseDTO(task));
      } catch (error) {
        next(error);
      }
    },
  };
}
